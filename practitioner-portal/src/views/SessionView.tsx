import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  BindingCommitResult,
  BindingDescriptor,
  BoundValues,
  CaseContext,
  SessionContext,
} from "shared"
import { href } from "../App"
import { BoundControl, useDisplayValue } from "../components/BoundControl"
import { ErrorNote, Loading, NoteBadge } from "../components/common"
import { Icon } from "../components/Icon"
import { NoteControl } from "../components/NoteControl"
import { bindingDictionary, dbs, DbsError } from "../dbs"
import { formatDateTime } from "../format"
import { loadNote, noteKey, saveNote } from "../notes-store"
import { MODULES, templateFor } from "../seed/modules"
import { PRACTITIONER } from "../seed/notes"
import type { ModuleAnswers, NoteFieldDef, SessionNote, SessionTemplate } from "../seed/types"
import {
  bindingGroups,
  boundFields,
  changesFor,
  instancesFor,
  outcomeText,
  SHARED_GROUP,
  type BindingGroup,
  type ModuleInstance,
} from "../session-note"

interface Loaded {
  session: SessionContext
  caseContext: CaseContext | null
  dictionary: Map<string, BindingDescriptor>
  template: SessionTemplate
  instances: ModuleInstance[]
  groups: BindingGroup[]
  // What ICIS holds, per group, as resolved when the note was opened.
  baseline: Record<string, BoundValues>
  resolvedAt: string
}

// Every case/session binding any template might use: resolved first, so
// the session's own type can pick the template.
const SHARED_BINDINGS = [
  ...new Set(
    MODULES.filter((m) => m.scope === "case" || m.scope === "session").flatMap((m) =>
      boundFields(m).map((f) => f.binding),
    ),
  ),
]

async function load(sessionId: string): Promise<Loaded> {
  const [session, dictionary] = await Promise.all([dbs.sessionContext(sessionId), bindingDictionary()])
  const sharedAnchor = { session: session.id, ...(session.case ? { case: session.case.id } : {}) }
  const sharedKeys = SHARED_BINDINGS.filter(
    (k) => dictionary.has(k) && (session.case || dictionary.get(k)!.anchor !== "case"),
  )
  const [shared, caseContext] = await Promise.all([
    dbs.resolve(sharedAnchor, sharedKeys),
    session.case ? dbs.caseContext(session.case.id) : Promise.resolve(null),
  ])
  const template = templateFor(shared.values["session.sessionType"])
  const instances = instancesFor(template, session)
  const groups = bindingGroups(instances, dictionary)
  const baseline: Record<string, BoundValues> = {}
  await Promise.all(
    groups.map(async (group) => {
      if (group.id === SHARED_GROUP) {
        baseline[group.id] = Object.fromEntries(group.bindings.map((k) => [k, shared.values[k] ?? null]))
      } else {
        baseline[group.id] = (await dbs.resolve(group.anchor, group.bindings)).values
      }
    }),
  )
  return { session, caseContext, dictionary, template, instances, groups, baseline, resolvedAt: shared.resolvedAt }
}

// The note field values that are missing but required.
function missingRequired(instances: ModuleInstance[], answers: Record<string, ModuleAnswers>) {
  const missing: string[] = []
  for (const instance of instances) {
    for (const field of instance.module.fields) {
      if (field.kind === "bound" || !("required" in field) || !field.required) continue
      const value = answers[instance.key]?.[field.id]
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
        missing.push(`${instance.module.title}${instance.client ? ` (${instance.client.displayName})` : ""}: ${(field as NoteFieldDef).label}`)
      }
    }
  }
  return missing
}

function ResultLine({
  descriptor,
  label,
  result,
}: {
  descriptor: BindingDescriptor | undefined
  label: string
  result: BindingCommitResult
}) {
  const current = useDisplayValue(descriptor, result.current ?? null)
  const tone = result.status === "written" ? "good" : result.status === "unchanged" || result.status === "readOnly" ? "neutral" : "bad"
  return (
    <li className={`result ${tone}`}>
      <Icon name={tone === "good" ? "check" : tone === "bad" ? "alert" : "check"} size={14} />
      <span>
        <strong>{label}</strong> — {outcomeText(result, current ?? undefined)}
      </span>
    </li>
  )
}

export function SessionView({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, ModuleAnswers>>({})
  const [current, setCurrent] = useState<Record<string, BoundValues>>({})
  const [note, setNote] = useState<SessionNote | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: "info" | "good" | "bad"; text: string } | null>(null)
  const [active, setActive] = useState<string | null>(null)

  const key = loaded ? noteKey(loaded.session.case?.caseNumber ?? null, loaded.session.subject) : null

  const open = useCallback(
    (keepAnswers?: Record<string, ModuleAnswers>) => {
      setError(null)
      load(sessionId).then(
        (l) => {
          const saved = loadNote(noteKey(l.session.case?.caseNumber ?? null, l.session.subject))
          setLoaded(l)
          setNote(saved)
          setAnswers(keepAnswers ?? saved?.answers ?? {})
          // A draft's unsent bound edits go back over what ICIS holds now.
          const pending = saved?.status === "draft" ? saved.pendingBound ?? {} : {}
          setCurrent(
            Object.fromEntries(l.groups.map((g) => [g.id, { ...l.baseline[g.id], ...(pending[g.id] ?? {}) }])),
          )
          setEditing(saved?.status !== "submitted")
        },
        (e: Error) => setError(e.message),
      )
    },
    [sessionId],
  )

  useEffect(() => open(), [open])

  // Which module is on screen, for the step list.
  useEffect(() => {
    if (!loaded) return
    const onScroll = () => {
      const ids = loaded.instances.map((i) => i.key)
      const visible = [...ids].reverse().find((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? 9999) < 240)
      setActive(visible ?? ids[0])
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [loaded])

  const previous = useMemo(() => {
    if (!loaded?.caseContext) return null
    const sessions = loaded.caseContext.sessions
    const index = sessions.findIndex((s) => s.id === loaded.session.id)
    for (let i = index - 1; i >= 0; i--) {
      const prior = loadNote(noteKey(loaded.caseContext.caseNumber, sessions[i].subject))
      if (prior?.status === "submitted") return { session: sessions[i], note: prior }
    }
    return null
  }, [loaded])

  if (error) {
    return (
      <div className="screen">
        <ErrorNote error={error} onRetry={() => open()} />
      </div>
    )
  }
  if (!loaded || !key) {
    return (
      <div className="screen">
        <Loading what="the session" />
      </div>
    )
  }

  const { session, dictionary, template, instances, groups, baseline } = loaded
  const readOnly = !editing || busy
  const boundCount = groups.reduce((n, g) => n + g.bindings.length, 0)
  const committed = note?.status === "submitted" ? note.committed ?? {} : {}

  const setAnswer = (instanceKey: string, fieldId: string, value: ModuleAnswers[string]) =>
    setAnswers((a) => ({ ...a, [instanceKey]: { ...a[instanceKey], [fieldId]: value } }))
  const setBound = (group: string, binding: string, value: string | null) =>
    setCurrent((c) => ({ ...c, [group]: { ...c[group], [binding]: value } }))

  const pendingChanges = () =>
    Object.fromEntries(groups.map((g) => [g.id, changesFor(g, dictionary, current[g.id] ?? {}, baseline[g.id] ?? {})]))
  const changeCount = Object.values(pendingChanges()).reduce((n, c) => n + Object.keys(c).length, 0)

  const saveDraft = () => {
    const next: SessionNote = {
      status: "draft",
      savedAt: new Date().toLocaleString("en-AU", { timeZone: "Australia/Perth" }),
      savedBy: PRACTITIONER.name,
      answers,
      pendingBound: pendingChanges(),
    }
    saveNote(key, next)
    setNote(next)
    setNotice({
      tone: "info",
      text:
        changeCount > 0
          ? `Draft saved. ${changeCount} change${changeCount === 1 ? "" : "s"} to ICIS data will be sent when the note is submitted — drafts never write to ICIS.`
          : "Draft saved.",
    })
  }

  const submit = async () => {
    const missing = missingRequired(instances, answers)
    if (missing.length > 0) {
      setNotice({ tone: "bad", text: `Complete these before submitting: ${missing.join("; ")}.` })
      return
    }
    setBusy(true)
    setNotice(null)
    // The note is the record of what was captured; it's saved whatever
    // happens to the bound values. Then each group's changes go to the
    // DBS, which writes them to ICIS -- or says why not.
    const changes = pendingChanges()
    const outcome: NonNullable<SessionNote["committed"]> = {}
    for (const group of groups) {
      const values = changes[group.id]
      if (Object.keys(values).length === 0) continue
      try {
        const { results } = await dbs.commit(group.anchor, values, baseline[group.id])
        outcome[group.id] = { values, results }
      } catch (e) {
        const message = e instanceof DbsError ? e.message : String(e)
        outcome[group.id] = {
          values,
          results: Object.fromEntries(Object.keys(values).map((k) => [k, { status: "failed" as const, message }])),
        }
      }
    }
    const next: SessionNote = {
      status: "submitted",
      savedAt: new Date().toLocaleString("en-AU", { timeZone: "Australia/Perth" }),
      savedBy: PRACTITIONER.name,
      answers,
      committed: outcome,
    }
    saveNote(key, next)
    const results = Object.values(outcome).flatMap((o) => Object.values(o.results))
    const problems = results.filter((r) => r.status === "conflict" || r.status === "failed").length
    setNotice({
      tone: problems > 0 ? "bad" : "good",
      text:
        results.length === 0
          ? "Session note submitted. No ICIS data was changed."
          : problems > 0
            ? `Session note submitted. ${problems} change${problems === 1 ? "" : "s"} couldn't be saved to ICIS — see below. The note itself is saved.`
            : `Session note submitted, and ${results.length} change${results.length === 1 ? "" : "s"} saved to ICIS.`,
    })
    setBusy(false)
    // Re-read ICIS so the note now shows what it holds.
    open(answers)
  }

  const hintFor = (group: string, binding: string) => {
    const result = committed[group]?.results[binding]
    const sent = committed[group]?.values[binding]
    if (result && result.status !== "written") {
      return <OutcomeHint descriptor={dictionary.get(binding)} result={result} />
    }
    if (result?.status === "written" && sent !== undefined && (baseline[group]?.[binding] ?? null) !== sent) {
      return <ChangedSince descriptor={dictionary.get(binding)} sent={sent} />
    }
    if (result?.status === "written") return <span className="hint good">Saved to ICIS with this note</span>
    if (editing && (current[group]?.[binding] ?? null) !== (baseline[group]?.[binding] ?? null)) {
      return <span className="hint pending">Changed — saved to ICIS when the note is submitted</span>
    }
    return null
  }

  return (
    <div className="note-screen">
      <div className="backbar">
        {session.case ? (
          <a href={href({ page: "case", caseNumber: session.case.caseNumber ?? "", tab: "sessions" })}>
            <Icon name="arrowLeft" size={16} />
            Back to case
          </a>
        ) : (
          <a href={href({ page: "home" })}>
            <Icon name="arrowLeft" size={16} />
            Home
          </a>
        )}
      </div>
      <div className="note-top">
        <div className="note-identity">
          <p>
            COUNSELLING{session.case ? ` · CASE ${session.case.caseNumber}` : ""} · {template.name.toUpperCase()}
          </p>
          <h1>{session.subject}</h1>
          <span>
            {formatDateTime(session.scheduledStart)} · {session.participants.map((p) => p.client.displayName).join(" & ")}
          </span>
        </div>
        <div className="note-status">
          <NoteBadge note={note} />
          {note && <small>Last saved {note.savedAt}</small>}
        </div>
        <div className="note-actions">
          {editing ? (
            <>
              <button className="button outline" onClick={saveDraft} disabled={busy}>
                Save as draft
              </button>
              <button className="button" onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit session note"}
              </button>
            </>
          ) : (
            <button className="button outline" onClick={() => setEditing(true)}>
              Edit session note
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="note-layout">
        <aside className="note-nav">
          <p>{template.name.toUpperCase()}</p>
          {instances.map((instance, i) => (
            <a
              key={instance.key}
              href={`#${instance.key}`}
              className={active === instance.key ? "active" : ""}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(instance.key)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
            >
              <b>{i + 1}</b>
              <span>
                {instance.module.title}
                {instance.client && <small>{instance.client.displayName}</small>}
              </span>
            </a>
          ))}
        </aside>

        <div className="note-form">
          <div className="source-banner">
            <Icon name="database" size={20} />
            <span>
              <strong>
                {boundCount} fields on this note are read from ICIS through the Data Binding Service
              </strong>
              <small>
                Marked <span className="icis-badge inline">ICIS</span>. Edits to them are saved back to ICIS when the note is
                submitted; everything else stays in the session note.
              </small>
            </span>
          </div>

          {previous && (
            <details className="note-module previous" open>
              <summary>
                <b>
                  <Icon name="file" size={16} />
                </b>
                <span>
                  <h2>Previous session summary</h2>
                  <p>
                    From the note for {previous.session.subject} ({formatDateTime(previous.session.scheduledStart)}).
                  </p>
                </span>
                <Icon name="chevronDown" />
              </summary>
              <div className="module-body">
                <div className="readonly-answers">
                  <p>ISSUES TO RAISE THIS SESSION</p>
                  <span>{String(previous.note.answers["next-session"]?.next ?? "None recorded.")}</span>
                </div>
              </div>
            </details>
          )}

          {instances.map((instance, i) => {
            const bound = boundFields(instance.module)
            return (
              <details key={instance.key} id={instance.key} className={`note-module scope-${instance.module.scope}`} open>
                <summary>
                  <b>{i + 1}</b>
                  <span>
                    <h2>
                      {instance.module.title}
                      {instance.client && <em> · {instance.client.displayName}</em>}
                    </h2>
                    <p>{instance.module.description}</p>
                  </span>
                  <span className={`scope-badge ${instance.module.scope}`}>{SCOPE_LABEL[instance.module.scope]}</span>
                  {bound.length > 0 && (
                    <span className="icis-count">
                      <Icon name="link" size={12} />
                      {bound.length} from ICIS
                    </span>
                  )}
                  <Icon name="chevronDown" />
                </summary>
                <div className="module-body fields">
                  {instance.module.fields.map((field) =>
                    field.kind === "bound" ? (
                      <BoundControl
                        key={field.id}
                        field={field}
                        descriptor={dictionary.get(field.binding)}
                        value={current[instance.group]?.[field.binding] ?? null}
                        onChange={(v) => setBound(instance.group, field.binding, v)}
                        disabled={readOnly}
                        hint={hintFor(instance.group, field.binding)}
                      />
                    ) : (
                      <NoteControl
                        key={field.id}
                        field={field}
                        value={answers[instance.key]?.[field.id]}
                        onChange={(v) => setAnswer(instance.key, field.id, v)}
                        disabled={readOnly}
                      />
                    ),
                  )}
                </div>
              </details>
            )
          })}
        </div>

        <aside className="note-rail">
          <div className="rail-card">
            <p>DATA BINDING</p>
            <h3>{groups.length} records in ICIS</h3>
            <ul className="group-list">
              {groups.map((g) => (
                <li key={g.id}>
                  <strong>{g.label}</strong>
                  <span className="anchor-chips">
                    {Object.keys(g.anchor).map((a) => (
                      <span key={a} className="anchor-chip">
                        {a}
                      </span>
                    ))}
                  </span>
                  <small>
                    {g.bindings.length} bound field{g.bindings.length === 1 ? "" : "s"}
                    {editing && Object.keys(changesFor(g, dictionary, current[g.id] ?? {}, baseline[g.id] ?? {})).length > 0 && (
                      <em> · {Object.keys(changesFor(g, dictionary, current[g.id] ?? {}, baseline[g.id] ?? {})).length} changed</em>
                    )}
                  </small>
                </li>
              ))}
            </ul>
            <small className="muted">
              Read {new Date(loaded.resolvedAt).toLocaleTimeString("en-AU", { timeZone: "Australia/Perth" })}.
              {editing && changeCount > 0 && ` ${changeCount} change${changeCount === 1 ? "" : "s"} to send on submit.`}
            </small>
          </div>
          {Object.keys(committed).length > 0 && (
            <div className="rail-card">
              <p>SAVED WITH THIS NOTE</p>
              <h3>What happened in ICIS</h3>
              <ul className="results">
                {groups.flatMap((g) =>
                  Object.entries(committed[g.id]?.results ?? {}).map(([binding, result]) => (
                    <ResultLine
                      key={`${g.id}-${binding}`}
                      descriptor={dictionary.get(binding)}
                      label={`${dictionary.get(binding)?.label ?? binding}${g.id === SHARED_GROUP ? "" : ` (${g.label})`}`}
                      result={result}
                    />
                  )),
                )}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

const SCOPE_LABEL = {
  case: "Case module",
  session: "Session module",
  client: "Client module",
  sessionParticipant: "Participant module",
} as const

function OutcomeHint({ descriptor, result }: { descriptor: BindingDescriptor | undefined; result: BindingCommitResult }) {
  const current = useDisplayValue(descriptor, result.current ?? null)
  return <span className="hint bad">{outcomeText(result, current ?? undefined)}</span>
}

// A value saved with this note that ICIS no longer holds: someone has
// changed it since (proposal decision 1 -- show it, don't silently swap).
function ChangedSince({ descriptor, sent }: { descriptor: BindingDescriptor | undefined; sent: string | null }) {
  const label = useDisplayValue(descriptor, sent)
  return <span className="hint pending">Changed in ICIS since this note was submitted (this note saved "{label ?? "no value"}")</span>
}
