import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BindingCommitResult,
  BindingDescriptor,
  BoundValues,
  CaseContext,
  SessionAnchor,
} from "shared"
import { href } from "../App"
import { BoundControl, useDisplayValue } from "../components/BoundControl"
import { ErrorNote, Loading, NoteBadge } from "../components/common"
import { Icon } from "../components/Icon"
import { NoteControl } from "../components/NoteControl"
import { bindingDictionary, dbs } from "../dbs"
import { formatDateTime } from "../format"
import { loadNote, noteKey, refreshNote, saveNote, submitNote } from "../notes-store"
import { MODULES, templateFor } from "../seed/modules"
import { PRACTITIONER } from "../seed/notes"
import type { ModuleAnswers, NoteFieldDef, NoteIcisChange, SessionNote, SessionTemplate } from "../seed/types"
import {
  bindingGroups,
  boundFields,
  changesFor,
  instancesFor,
  outcomeText,
  type BindingGroup,
  type ModuleInstance,
} from "../session-note"

interface Loaded {
  caseContext: CaseContext
  session: SessionAnchor
  dictionary: Map<string, BindingDescriptor>
  template: SessionTemplate
  instances: ModuleInstance[]
  groups: BindingGroup[]
  // What ICIS holds, per group, as resolved when the note was opened.
  baseline: Record<string, BoundValues>
  resolvedAt: string
}

// Every session binding any template might use: resolved first, so the
// session's own type can pick the template.
const SESSION_BINDINGS = [
  ...new Set(MODULES.filter((m) => m.scope === "session").flatMap((m) => boundFields(m).map((f) => f.binding))),
]

// Opens the session through its case: the case's anchors give the session
// and each participant, then each group resolves against its own anchor --
// the DBS takes one anchor per call.
async function load(caseNumber: string, sessionId: string): Promise<Loaded> {
  const [caseContext, dictionary] = await Promise.all([dbs.findCase(caseNumber), bindingDictionary()])
  const session = caseContext.sessions.find((s) => s.id === sessionId)
  if (!session) throw new Error(`No such session on case ${caseNumber}`)
  const sessionKeys = SESSION_BINDINGS.filter((k) => dictionary.has(k))
  const sessionValues = (await dbs.resolve({ session: session.id }, sessionKeys)).values
  const template = templateFor(sessionValues["session.sessionType"])
  const instances = instancesFor(template, session)
  const groups = bindingGroups(instances, session, caseContext, dictionary)
  const baseline: Record<string, BoundValues> = {}
  await Promise.all(
    groups.map(async (group) => {
      baseline[group.id] =
        "session" in group.anchor
          ? Object.fromEntries(group.bindings.map((k) => [k, sessionValues[k] ?? null]))
          : (await dbs.resolve(group.anchor, group.bindings)).values
    }),
  )
  return { caseContext, session, dictionary, template, instances, groups, baseline, resolvedAt: new Date().toISOString() }
}
// The note field values that are missing but required.
function missingRequired(instances: ModuleInstance[], answers: Record<string, ModuleAnswers>) {
  const missing: string[] = []
  for (const instance of instances) {
    for (const field of instance.module.fields) {
      if (field.kind === "bound" || !("required" in field) || !field.required) continue
      const value = answers[instance.key]?.[field.id]
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
        missing.push(`${instance.module.title}${instance.participant ? ` (${instance.participant.client.displayName})` : ""}: ${(field as NoteFieldDef).label}`)
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

type Notice = { tone: "info" | "good" | "bad"; text: string }

// Where a submitted note stands, as the practitioner reads it.
function submitNotice(note: SessionNote): Notice {
  if (note.icis === "sending") {
    return {
      tone: "info",
      text: `Session note saved. Sending its changes to ICIS…${
        note.icisError ? ` Not through yet (${note.icisError}) — it keeps trying, and you can leave this page.` : ""
      }`,
    }
  }
  const results = Object.values(note.committed ?? {}).flatMap((o) => Object.values(o.results))
  const problems = results.filter((r) => r.status === "conflict" || r.status === "failed").length
  return {
    tone: problems > 0 ? "bad" : "good",
    text:
      results.length === 0
        ? "Session note saved. No ICIS data was changed."
        : problems > 0
          ? `Session note saved. ${problems} change${problems === 1 ? "" : "s"} couldn't be saved to ICIS — see below.`
          : `Session note saved, and ${results.length} change${results.length === 1 ? "" : "s"} saved to ICIS.`,
  }
}

export function SessionView({ caseNumber, sessionId }: { caseNumber: string; sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, ModuleAnswers>>({})
  const [current, setCurrent] = useState<Record<string, BoundValues>>({})
  const [note, setNote] = useState<SessionNote | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [active, setActive] = useState<string | null>(null)
  // Identifies one submit of this note, so resending it after a dropped
  // connection can't store it twice. A fresh one each time the note opens.
  const submitId = useRef(crypto.randomUUID())

  const key = loaded ? noteKey(loaded.caseContext.caseNumber, loaded.session.subject) : null

  const open = useCallback(
    (keepAnswers?: Record<string, ModuleAnswers>) => {
      setError(null)
      load(caseNumber, sessionId).then(
        (l) => {
          const saved = loadNote(noteKey(l.caseContext.caseNumber, l.session.subject))
          submitId.current = crypto.randomUUID()
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
    [caseNumber, sessionId],
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
    if (!loaded) return null
    const sessions = loaded.caseContext.sessions
    const index = sessions.findIndex((s) => s.id === loaded.session.id)
    for (let i = index - 1; i >= 0; i--) {
      const prior = loadNote(noteKey(loaded.caseContext.caseNumber, sessions[i].subject))
      if (prior?.status === "submitted") return { session: sessions[i], note: prior }
    }
    return null
  }, [loaded])

  // While the notes server is still sending a submitted note's changes to
  // ICIS, follow along; once they're all answered, re-read ICIS.
  useEffect(() => {
    if (!key || note?.icis !== "sending") return
    const timer = setInterval(() => {
      refreshNote(key).then(
        (latest) => {
          if (!latest) return
          setNotice(submitNotice(latest))
          if (latest.icis === "sending") setNote(latest)
          else open()
        },
        () => undefined,
      )
    }, 2000)
    return () => clearInterval(timer)
  }, [key, note?.icis, open])

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

  const saveDraft = async () => {
    const next: SessionNote = {
      status: "draft",
      savedAt: new Date().toLocaleString("en-AU", { timeZone: "Australia/Perth" }),
      savedBy: PRACTITIONER.name,
      answers,
      pendingBound: pendingChanges(),
    }
    setBusy(true)
    try {
      await saveNote(key, next)
    } catch (e) {
      setNotice({ tone: "bad", text: `Draft not saved: ${(e as Error).message}.` })
      return
    } finally {
      setBusy(false)
    }
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
    setNotice({ tone: "info", text: "Saving…" })
    // One request: the notes server stores the note and its ICIS changes in
    // one transaction -- both or neither -- then sends the changes to ICIS
    // itself, through the DBS, retrying until each is answered.
    const pending = pendingChanges()
    const changes: NoteIcisChange[] = groups
      .filter((g) => Object.keys(pending[g.id]).length > 0)
      .map((g) => ({ group: g.id, anchor: g.anchor, values: pending[g.id], baseline: baseline[g.id] }))
    const submitted: SessionNote = {
      status: "submitted",
      savedAt: new Date().toLocaleString("en-AU", { timeZone: "Australia/Perth" }),
      savedBy: PRACTITIONER.name,
      answers,
    }
    let stored: SessionNote
    try {
      stored = await submitNote(key, submitId.current, submitted, changes, (attempt) =>
        setNotice({
          tone: "info",
          text: `Connection problem — trying again (attempt ${attempt + 1})… The note isn't saved yet.`,
        }),
      )
    } catch (e) {
      setNotice({
        tone: "bad",
        text: `Not saved: ${(e as Error).message}. Nothing was sent to ICIS, and your answers are still here — try again.`,
      })
      setBusy(false)
      return
    }
    setBusy(false)
    setNotice(submitNotice(stored))
    if (stored.icis === "sending") {
      setNote(stored)
      setEditing(false)
    } else {
      // Re-read ICIS so the note now shows what it holds.
      open()
    }
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
        <a href={href({ page: "case", caseNumber, tab: "sessions" })}>
          <Icon name="arrowLeft" size={16} />
          Back to case
        </a>
      </div>
      <div className="note-top">
        <div className="note-identity">
          <p>
            COUNSELLING · CASE {caseNumber} · {template.name.toUpperCase()}
          </p>
          <h1>{session.subject}</h1>
          <span>
            {formatDateTime(session.start)} · {session.participants.map((p) => p.client.displayName).join(" & ")}
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
                {instance.participant && <small>{instance.participant.client.displayName}</small>}
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
                    From the note for {previous.session.subject} ({formatDateTime(previous.session.start)}).
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
                      {instance.participant && <em> · {instance.participant.client.displayName}</em>}
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
                      label={`${dictionary.get(binding)?.label ?? binding}${g.label === "Case" || g.label === "Session" ? "" : ` (${g.label.split(" · ")[0]})`}`}
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
  participant: "Participant module",
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
