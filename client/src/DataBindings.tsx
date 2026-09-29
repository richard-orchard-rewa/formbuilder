import { useCallback, useEffect, useState } from "react"
import type {
  AttributeCandidate,
  BindingPresentation,
  ManagedBinding,
} from "shared"
import {
  BindingRuleRejectedError,
  listBindingCandidates,
  listManagedBindings,
  publishBinding,
  saveBindingDraft,
} from "./api.js"

interface DataBindingsProps {
  onBack: () => void
}

type Load =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready"
      bindings: ManagedBinding[]
      candidates: AttributeCandidate[]
    }

// The binding creator (docs/proposals/databound-fields.md, "Creating
// bindings without a developer"): a data steward creates data-bound fields
// on allow-listed client attributes, and publishes them for form builders
// to use. Every rule lives in the Data Binding Service; this page shows the
// store's limits and the service's reasons, and relays requests.
export function DataBindings({ onBack }: DataBindingsProps) {
  const [load, setLoad] = useState<Load>({ status: "loading" })
  // The attribute being bound; its candidate is always read from the latest
  // load, so the editor reflects the service's current limits.
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(() => {
    return Promise.all([listManagedBindings(), listBindingCandidates()])
      .then(([bindings, candidates]) =>
        setLoad({ status: "ready", bindings, candidates }),
      )
      .catch(() => setLoad({ status: "error" }))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // What a binding may offer depends on the service's ICIS privileges,
  // which can change in ICIS at any time (in a demo, in the next tab).
  // Re-check whenever the steward comes back to this page.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const editingCandidate =
    load.status === "ready" && editing
      ? load.candidates.find((c) => c.attribute === editing)
      : undefined

  const existingFor = (candidate: AttributeCandidate) =>
    load.status === "ready"
      ? load.bindings.find((b) => b.key === candidate.boundBy)
      : undefined

  return (
    <main className="data-bindings">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>Data bindings</h1>
      </header>
      <p className="data-bindings__intro">
        Fields that read from, and save back to, a client's ICIS record.
        Published bindings appear in the form builder's <em>Data bound</em>{" "}
        palette. Only attributes a data owner has approved are offered, and
        each can do no more than ICIS and the Data Binding Service's own
        account allow.
      </p>

      {load.status === "loading" && <p>Loading…</p>}
      {load.status === "error" && (
        <p role="alert">Couldn't reach the Data Binding Service.</p>
      )}
      {notice && <p role="status">{notice}</p>}

      {load.status === "ready" && (
        <>
          <BindingsTable
            bindings={load.bindings}
            onPublished={(key) => {
              setNotice(`Published ${key}.`)
              void refresh()
            }}
          />

          <h2>Create a binding</h2>
          <CandidatesTable
            candidates={load.candidates}
            bindings={load.bindings}
            onCreate={async (candidate) => {
              setNotice(null)
              // Open the editor on the service's limits as they are now.
              await refresh()
              setEditing(candidate.attribute)
            }}
          />

          {editingCandidate && (
            <BindingEditor
              key={editingCandidate.attribute}
              candidate={editingCandidate}
              existing={existingFor(editingCandidate)}
              onCancel={() => setEditing(null)}
              onChanged={() => void refresh()}
              onSaved={(binding, published) => {
                setEditing(null)
                setNotice(
                  published
                    ? `Published ${binding.key}. It's now in the form builder's Data bound palette.`
                    : `Saved a draft of ${binding.key}. Publish it (above) to use it on forms.`,
                )
                void refresh()
              }}
            />
          )}
        </>
      )}
    </main>
  )
}

function latest(binding: ManagedBinding) {
  return [...binding.versions].sort((a, b) => b.version - a.version)[0]
}

function BindingsTable({
  bindings,
  onPublished,
}: {
  bindings: ManagedBinding[]
  onPublished: (key: string) => void
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function publish(key: string) {
    setErrors((current) => ({ ...current, [key]: "" }))
    try {
      await publishBinding(key)
      onPublished(key)
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [key]:
          error instanceof BindingRuleRejectedError
            ? error.message
            : "Couldn't publish this binding.",
      }))
    }
  }

  return (
    <table className="data-bindings__table" aria-label="Bindings">
      <thead>
        <tr>
          <th>Binding</th>
          <th>ICIS attribute</th>
          <th>On forms</th>
          <th>Version</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {bindings.map((binding) => {
          const current = latest(binding)
          const draft = binding.versions.find((v) => v.status === "draft")
          return (
            <tr key={binding.key}>
              <td>
                <strong>{current.descriptor.label}</strong>
                <br />
                <code>{binding.key}</code>
              </td>
              <td>
                <code>{binding.attribute}</code>
              </td>
              <td>
                {current.descriptor.access === "read" ? "Display only" : "Editable"}
                {current.descriptor.control.kind === "text" &&
                  current.descriptor.control.maxLength && (
                    <>, up to {current.descriptor.control.maxLength} characters</>
                  )}
                {current.descriptor.control.kind === "lookup" && (
                  <>
                    ,{" "}
                    {(current.descriptor.presentations?.allowed ?? ["dropdown"])
                      .map((p) => PRESENTATION_NAMES[p])
                      .join(" or ")}
                  </>
                )}
              </td>
              <td>
                v{current.version} ·{" "}
                {binding.origin === "code"
                  ? "built in"
                  : draft
                    ? "draft"
                    : "published"}
              </td>
              <td>
                {draft && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void publish(binding.key)}
                  >
                    Publish v{draft.version}
                  </button>
                )}
                {errors[binding.key] && (
                  <p className="data-bindings__error" role="alert">
                    {errors[binding.key]}
                  </p>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const PRESENTATION_NAMES: Record<BindingPresentation, string> = {
  text: "text box",
  dropdown: "dropdown",
  radio: "radio buttons",
}

function describeType(candidate: AttributeCandidate) {
  if (candidate.strategy === "lookup") return `Dropdown from ${candidate.lookupTarget}`
  if (candidate.strategy === "attribute") {
    return candidate.maxLength ? `Text, up to ${candidate.maxLength}` : "Text"
  }
  return "Not supported yet"
}

function CandidatesTable({
  candidates,
  bindings,
  onCreate,
}: {
  candidates: AttributeCandidate[]
  bindings: ManagedBinding[]
  onCreate: (candidate: AttributeCandidate) => void | Promise<void>
}) {
  // A note that applies to every attribute (e.g. the service's account
  // can't write client records at all) is about the service, not the row --
  // say it once.
  const everyRow = (note: string) =>
    candidates.length > 1 &&
    candidates.every((c) => c.accessNotes.includes(note) || c.problems.includes(note))
  const shared = [...new Set(candidates.flatMap((c) => [...c.accessNotes, ...c.problems]))].filter(
    everyRow,
  )

  return (
    <>
      {shared.length > 0 && (
        <div className="data-bindings__banner" role="note">
          {shared.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      <table className="data-bindings__table" aria-label="Available attributes">
        <thead>
          <tr>
            <th>ICIS attribute</th>
            <th>Type</th>
            <th>Most it can be</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => {
            const existing = bindings.find((b) => b.key === candidate.boundBy)
            const builtIn = existing?.origin === "code"
            const notes = [...candidate.accessNotes, ...candidate.problems].filter(
              (note) => !shared.includes(note),
            )
            return (
              <tr key={candidate.attribute}>
                <td>
                  <strong>{candidate.displayName}</strong>
                  <br />
                  <code>{candidate.attribute}</code>
                </td>
                <td>{describeType(candidate)}</td>
                <td>{candidate.maxAccess === "read" ? "Display only" : "Editable"}</td>
                <td className="data-bindings__notes">
                  {candidate.boundBy && (
                    <p>
                      Bound as <code>{candidate.boundBy}</code>
                    </p>
                  )}
                  {notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </td>
                <td>
                  {!builtIn && candidate.strategy && (
                    <button type="button" onClick={() => void onCreate(candidate)}>
                      {existing ? "New version" : "Create binding"}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

// "Preferred Name" -> "client.preferredName"
function suggestKey(displayName: string) {
  const words = displayName.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/)
  const camel = words
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("")
  return `client.${camel}`
}

function BindingEditor({
  candidate,
  existing,
  onCancel,
  onChanged,
  onSaved,
}: {
  candidate: AttributeCandidate
  existing: ManagedBinding | undefined
  onCancel: () => void
  // Something was saved but the editor stays open (a draft saved, then
  // publishing it refused).
  onChanged: () => void
  onSaved: (binding: ManagedBinding, published: boolean) => void
}) {
  const base = existing ? latest(existing).descriptor : undefined
  const [key, setKey] = useState(existing?.key ?? suggestKey(candidate.displayName))
  const [label, setLabel] = useState(base?.label ?? candidate.displayName)
  const [description, setDescription] = useState(base?.description ?? "")
  const [access, setAccess] = useState<"read" | "readWrite">(
    base?.access ?? (candidate.maxAccess === "read" ? "read" : "readWrite"),
  )
  const [maxLength, setMaxLength] = useState<string>(
    base?.control.kind === "text" && base.control.maxLength
      ? String(base.control.maxLength)
      : candidate.maxLength
        ? String(candidate.maxLength)
        : "",
  )
  // Which of the strategy's presentations forms may use. Only a choice when
  // there's more than one (a lookup: dropdown and/or radio buttons).
  const [presentations, setPresentations] = useState<BindingPresentation[]>(
    base?.presentations?.allowed ?? candidate.presentations,
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // If the service's limits tighten while the editor is open, don't leave
  // an option selected that it would refuse.
  useEffect(() => {
    if (candidate.maxAccess === "read") setAccess("read")
  }, [candidate.maxAccess])

  async function save(publish: boolean) {
    setSaving(true)
    setError(null)
    let draftSaved = false
    try {
      const saved = await saveBindingDraft({
        key: key.trim(),
        label,
        description,
        attribute: candidate.attribute,
        access,
        ...(candidate.strategy === "attribute" && maxLength
          ? { maxLength: Number(maxLength) }
          : {}),
        ...(candidate.presentations.length > 1 ? { presentations } : {}),
      })
      draftSaved = true
      if (publish) {
        onSaved(await publishBinding(saved.key), true)
      } else {
        onSaved(saved, false)
      }
    } catch (err) {
      const reason =
        err instanceof BindingRuleRejectedError
          ? err.message
          : "Couldn't save this binding."
      setError(draftSaved ? `Saved as a draft, but not published: ${reason}` : reason)
      if (draftSaved) onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="binding-editor"
      aria-label="Binding editor"
      onSubmit={(event) => {
        event.preventDefault()
        void save(false)
      }}
    >
      <h3>
        {existing ? `New version of ${existing.key}` : "New binding"} on{" "}
        <code>{candidate.attribute}</code>
      </h3>
      <p className="binding-editor__inherited">
        From ICIS: {describeType(candidate)}
        {candidate.storeRequired && ", required on the record"}.
      </p>
      <label>
        Key
        <input
          type="text"
          value={key}
          disabled={existing !== undefined}
          onChange={(event) => setKey(event.target.value)}
        />
        <span className="binding-editor__hint">
          What forms refer to. Can't change once created.
        </span>
      </label>
      <label>
        Label
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label>
        Description
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <fieldset>
        <legend>On forms</legend>
        <label className="binding-editor__radio">
          <input
            type="radio"
            name="access"
            checked={access === "readWrite"}
            disabled={candidate.maxAccess === "read"}
            onChange={() => setAccess("readWrite")}
          />
          Editable — changes are saved back to ICIS
        </label>
        <label className="binding-editor__radio">
          <input
            type="radio"
            name="access"
            checked={access === "read"}
            onChange={() => setAccess("read")}
          />
          Display only
        </label>
        {candidate.accessNotes.map((note) => (
          <p key={note} className="binding-editor__hint">
            {note}
          </p>
        ))}
      </fieldset>
      {candidate.presentations.length > 1 && (
        <fieldset>
          <legend>Forms may show it as</legend>
          {candidate.presentations.map((presentation) => (
            <label key={presentation} className="binding-editor__radio">
              <input
                type="checkbox"
                checked={presentations.includes(presentation)}
                onChange={(event) =>
                  setPresentations((current) =>
                    event.target.checked
                      ? candidate.presentations.filter(
                          (p) => p === presentation || current.includes(p),
                        )
                      : current.filter((p) => p !== presentation),
                  )
                }
              />
              {PRESENTATION_NAMES[presentation].replace(/^./, (c) => c.toUpperCase())}
            </label>
          ))}
          <p className="binding-editor__hint">
            {presentations.length === 0
              ? "Choose at least one."
              : `Forms use ${PRESENTATION_NAMES[presentations[0]]} unless the form admin picks another. Radio buttons suit short lists; long lists are easier as a dropdown.`}
          </p>
        </fieldset>
      )}
      {candidate.strategy === "attribute" && (
        <label>
          Maximum length
          <input
            type="number"
            min={1}
            max={candidate.maxLength ?? undefined}
            value={maxLength}
            onChange={(e) => setMaxLength(e.target.value)}
          />
          {candidate.maxLength && (
            <span className="binding-editor__hint">
              ICIS allows up to {candidate.maxLength}; a binding can only
              narrow that.
            </span>
          )}
        </label>
      )}
      {error && (
        <p className="data-bindings__error" role="alert">
          {error}
        </p>
      )}
      <div className="binding-editor__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving || presentations.length === 0}>
          Save draft
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving || presentations.length === 0}
          onClick={(event) => {
            // The same checks the form's own submit runs (maximum length).
            if (event.currentTarget.form?.reportValidity()) void save(true)
          }}
        >
          {saving ? "Saving…" : "Save and publish"}
        </button>
      </div>
    </form>
  )
}
