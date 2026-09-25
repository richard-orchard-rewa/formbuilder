import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaRenderers } from "@jsonforms/vanilla-renderers"
import {
  isBoundField,
  type BindingCommitResult,
  type BoundField,
  type BoundValues,
  type ClientAnchor,
  type FieldOption,
  type FormVersion,
} from "shared"
import {
  findClient,
  getActiveVersion,
  getDraftSubmission,
  resolveBindings,
  saveDraftSubmission,
  submitForm,
  SubmissionRejectedError,
} from "./api.js"
import { formCells } from "./schema/formCells.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"
import { useBindingOptions } from "./schema/useBindingOptions.js"

interface FormFillProps {
  formId: string
  formName: string
  onBack: () => void
}

type Status = "loading" | "ready" | "no-active" | "error" | "submitted"

// Remembers the in-progress draft's id per form (US-4.3), so returning to
// the same form later resumes it instead of starting over. Reads/writes
// are wrapped in try/catch since localStorage can be unavailable (private
// browsing, blocked site data) -- when it is, saving a draft still works
// for the current visit, it just won't be resumable after a reload.
function draftStorageKey(formId: string) {
  return `form-fill-draft:${formId}`
}

function readSavedDraftId(formId: string): string | null {
  try {
    return window.localStorage.getItem(draftStorageKey(formId))
  } catch {
    return null
  }
}

function writeSavedDraftId(formId: string, submissionId: string) {
  try {
    window.localStorage.setItem(draftStorageKey(formId), submissionId)
  } catch {
    // Best-effort only.
  }
}

function clearSavedDraftId(formId: string) {
  try {
    window.localStorage.removeItem(draftStorageKey(formId))
  } catch {
    // Best-effort only.
  }
}

// The public-facing view a respondent fills out, rendered with the same
// JSON Forms renderer used by the builder's preview (ADR-0003) so the UI
// always matches the active schema version's field types and constraints
// (US-4.1). Required fields and type constraints (enum, number range,
// date bounds, ...) are validated client-side by JSON Forms/ajv against
// the generated JSON Schema, and independently re-checked by the server
// at submission time in case that's ever bypassed (US-3.5).
export function FormFill({ formId, formName, onBack }: FormFillProps) {
  const [version, setVersion] = useState<FormVersion | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [data, setData] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<unknown[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  // Data-bound fields (docs/proposals/databound-fields.md): the client the
  // form is being filled for, what their bound values were when loaded
  // (so a change made in ICIS since isn't silently overwritten), and what
  // happened to each bound value on submit.
  const [client, setClient] = useState<ClientAnchor | null>(null)
  const [baseline, setBaseline] = useState<BoundValues | undefined>()
  const [bindingResults, setBindingResults] = useState<Record<
    string,
    BindingCommitResult
  > | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setSubmissionId(null)
    setDraftMessage(null)

    async function load() {
      const active = await getActiveVersion(formId)
      if (cancelled) return
      setVersion(active)
      if (!active) {
        setStatus("no-active")
        return
      }

      const savedDraftId = readSavedDraftId(formId)
      const draft = savedDraftId
        ? await getDraftSubmission(formId, savedDraftId)
        : null
      if (cancelled) return

      if (draft) {
        setData(draft.data)
        setSubmissionId(draft.id)
      } else {
        if (savedDraftId) clearSavedDraftId(formId)
        setData({})
      }
      setStatus("ready")
    }

    load().catch(() => {
      if (!cancelled) setStatus("error")
    })

    return () => {
      cancelled = true
    }
  }, [formId])

  const boundFields = useMemo(
    () => (version?.schema.fields ?? []).filter(isBoundField),
    [version],
  )
  const bindingOptions = useBindingOptions(version?.schema.fields ?? [])
  const { schema, uiSchema } = useMemo(
    () => toJsonSchema(version?.schema ?? { fields: [] }, { bindingOptions }),
    [version, bindingOptions],
  )

  // Selecting a client replaces every bound field's value with that
  // client's current one -- the form is now "about" them.
  async function handleClientLoaded(found: ClientAnchor) {
    const { values } = await resolveBindings({ client: found.id }, [
      ...new Set(boundFields.map((field) => field.binding.key)),
    ])
    const next = { ...data }
    for (const field of boundFields) {
      const value = values[field.binding.key]
      if (value === null || value === undefined) delete next[field.id]
      else next[field.id] = value
    }
    setClient(found)
    setBaseline(values)
    setData(next)
  }

  async function handleSaveDraft() {
    setSubmitError(null)
    try {
      const draft = await saveDraftSubmission(
        formId,
        data,
        submissionId ?? undefined,
      )
      setSubmissionId(draft.id)
      writeSavedDraftId(formId, draft.id)
      setDraftMessage("Saved — you can return later to finish this form.")
    } catch {
      setDraftMessage(null)
      setSubmitError("Couldn't save this draft. Please try again.")
    }
  }

  async function handleSubmit() {
    if (errors.length > 0) {
      setShowValidation(true)
      return
    }
    setSubmitError(null)
    try {
      const submission = await submitForm(
        formId,
        data,
        submissionId ?? undefined,
        client ? { anchor: { client: client.id }, baseline } : undefined,
      )
      clearSavedDraftId(formId)
      setBindingResults(submission.bindingResults ?? null)
      setStatus("submitted")
    } catch (error) {
      if (error instanceof SubmissionRejectedError) {
        setSubmitError("Please fill out all required fields.")
      } else {
        setSubmitError("Couldn't submit this form. Please try again.")
      }
    }
  }

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{formName}</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load this form.</p>}
      {status === "no-active" && (
        <p role="alert">This form hasn't been published yet.</p>
      )}
      {status === "submitted" && <p>Thanks — your response was recorded.</p>}
      {status === "submitted" && bindingResults && (
        <BindingResultsSummary
          fields={boundFields}
          results={bindingResults}
          options={bindingOptions}
        />
      )}
      {submitError && <p role="alert">{submitError}</p>}
      {draftMessage && <p>{draftMessage}</p>}

      {status === "ready" && version && (
        <>
          {boundFields.length > 0 && (
            <ClientPicker client={client} onLoaded={handleClientLoaded} />
          )}
          <JsonForms
            schema={schema}
            uischema={uiSchema}
            data={data}
            renderers={vanillaRenderers}
            cells={formCells}
            validationMode={
              showValidation ? "ValidateAndShow" : "ValidateAndHide"
            }
            onChange={({ data, errors }) => {
              setData(data)
              setErrors(errors ?? [])
              setDraftMessage(null)
            }}
          />
          <button type="button" onClick={handleSaveDraft}>
            Save for later
          </button>
          <button type="button" className="primary" onClick={handleSubmit}>
            Submit
          </button>
        </>
      )}
    </main>
  )
}

// Chooses which client a form's data-bound fields read from and write to.
// In the real system the embedding session-notes app supplies this
// (requirements §9); the prototype asks for an ICIS client number.
function ClientPicker({
  client,
  onLoaded,
}: {
  client: ClientAnchor | null
  onLoaded: (client: ClientAnchor) => Promise<void>
}) {
  const [clientNumber, setClientNumber] = useState("")
  const [state, setState] = useState<
    "idle" | "loading" | "not-found" | "error"
  >("idle")

  async function load() {
    setState("loading")
    try {
      const found = await findClient(clientNumber.trim())
      if (!found) {
        setState("not-found")
        return
      }
      await onLoaded(found)
      setState("idle")
    } catch {
      setState("error")
    }
  }

  return (
    <section className="client-picker" aria-label="Client">
      {client ? (
        <p className="client-picker__current">
          Filling in for <strong>{client.displayName}</strong>
          {client.clientNumber && <> ({client.clientNumber})</>}
        </p>
      ) : (
        <p className="client-picker__current">
          Some fields on this form are linked to a client record. Load a
          client to fill them in from ICIS.
        </p>
      )}
      <form
        className="client-picker__form"
        onSubmit={(event) => {
          event.preventDefault()
          if (clientNumber.trim()) void load()
        }}
      >
        <label>
          ICIS client number
          <input
            type="text"
            inputMode="numeric"
            value={clientNumber}
            onChange={(event) => setClientNumber(event.target.value)}
          />
        </label>
        <button type="submit" disabled={state === "loading"}>
          {state === "loading"
            ? "Loading…"
            : client
              ? "Change client"
              : "Load client"}
        </button>
      </form>
      {state === "not-found" && (
        <p role="alert">No client found with that number.</p>
      )}
      {state === "error" && (
        <p role="alert">Couldn't reach the Data Binding Service.</p>
      )}
    </section>
  )
}

const RESULT_TEXT: Record<BindingCommitResult["status"], string> = {
  written: "Saved to ICIS",
  unchanged: "Unchanged",
  conflict: "Not saved — changed in ICIS since the form was opened",
  readOnly: "Display only",
  failed: "Not saved",
  skipped: "Not sent",
}

// After submit: what happened to each data-bound value. The submission
// itself is always recorded; a bound value that couldn't be written is
// reported here rather than failing the form.
function BindingResultsSummary({
  fields,
  results,
  options,
}: {
  fields: BoundField[]
  results: Record<string, BindingCommitResult>
  options: Record<string, FieldOption[]>
}) {
  const labelFor = (key: string, value: string | null | undefined) =>
    options[key]?.find((option) => option.value === value)?.label ??
    value ??
    "blank"

  return (
    <section className="binding-results" aria-label="Client record updates">
      <h2>Client record</h2>
      <ul>
        {fields
          .filter((field) => results[field.binding.key])
          .map((field) => {
            const result = results[field.binding.key]
            return (
              <li
                key={field.id}
                className={`binding-results__item binding-results__item--${result.status}`}
              >
                <strong>{field.label}:</strong> {RESULT_TEXT[result.status]}
                {result.status === "conflict" && (
                  <> (ICIS now has “{labelFor(field.binding.key, result.current)}”)</>
                )}
                {result.message && result.status !== "conflict" && (
                  <span className="binding-results__message">
                    {" "}
                    — {result.message}
                  </span>
                )}
              </li>
            )
          })}
      </ul>
    </section>
  )
}
