import { useCallback, useEffect, useState } from "react"
import {
  isBoundField,
  type BoundField,
  type BoundValues,
  type SessionAnchor,
  type SessionTemplateBindingContext,
  type SessionTemplateBindingResults,
  type SessionTemplateSection,
} from "shared"
import { href } from "../App"
import { ErrorNote, Loading } from "../components/common"
import { Icon } from "../components/Icon"
import { TemplateFieldControl } from "../components/TemplateFieldControl"
import { dbs } from "../dbs"
import { formatDateTime } from "../format"
import { FormBuilderError, getPublishedTemplate, getSubmission, submitNote } from "../formbuilder"
import { noteKey } from "../notes-store"
import { outcomeText } from "../session-note"
import {
  bindingContext,
  boundOn,
  defaultsFor,
  fieldsOfScope,
  missingRequired,
  sectionsOf,
  submissionData,
  type Data,
} from "../template-note"
import { clearDraft, loadDraft, loadPointer, saveDraft, savePointer } from "../template-notes-store"

interface Draft {
  kind: "draft"
  session: SessionAnchor
  caseNumber: string
  templateName: string
  sections: SessionTemplateSection[]
  baseline: NonNullable<SessionTemplateBindingContext["baseline"]>
  sessionData: Data
  participantData: Record<string, Data>
  resumed: string | null
}

interface Submitted {
  kind: "submitted"
  session: SessionAnchor
  caseNumber: string
  templateName: string
  versionNumber: number
  sections: SessionTemplateSection[]
  sessionData: Data
  participantData: Record<string, Data>
  results: SessionTemplateBindingResults | undefined
  submittedAt: string
  submittedBy: string | null
}

type Loaded = Draft | Submitted

// Reads `fields`' bindings off one anchor: the values by binding key (the
// baseline the commit is checked against) and the same values by field ID
// (what the form starts with).
async function resolveInto(anchor: Parameters<typeof dbs.resolve>[0], fields: BoundField[]) {
  if (fields.length === 0) return { baseline: {} as BoundValues, data: {} as Data }
  const { values } = await dbs.resolve(anchor, [...new Set(fields.map((f) => f.binding.key))])
  const data: Data = {}
  for (const field of fields) {
    const value = values[field.binding.key]
    if (value !== null && value !== undefined) data[field.id] = value
  }
  return { baseline: values, data }
}

const participantsOf = (data: Data): Record<string, Data> =>
  data.participants && typeof data.participants === "object" ? (data.participants as Record<string, Data>) : {}

async function load(caseNumber: string, sessionId: string, templateId: string): Promise<Loaded> {
  const caseContext = await dbs.findCase(caseNumber)
  const session = caseContext.sessions.find((s) => s.id === sessionId)
  if (!session) throw new Error(`No such session on case ${caseNumber}`)
  const key = noteKey(caseContext.caseNumber, session.subject)

  // A session has one note: once it's submitted it's shown, whichever
  // template it was written with.
  const pointer = loadPointer(key)
  if (pointer) {
    const detail = await getSubmission(pointer.templateId, pointer.submissionId)
    return {
      kind: "submitted",
      session,
      caseNumber,
      templateName: pointer.templateName,
      versionNumber: detail.sessionTemplateVersionNumber,
      sections: sectionsOf(detail.schema),
      sessionData: detail.data,
      participantData: participantsOf(detail.data),
      results: detail.bindingResults,
      submittedAt: detail.submittedAt,
      submittedBy: detail.submittedBy,
    }
  }

  const { template, version } = await getPublishedTemplate(templateId)
  const sections = sectionsOf(version.schema)
  const sessionFields = fieldsOfScope(sections, "session")
  const participantFields = fieldsOfScope(sections, "participant")

  // Every bound field is filled from its own anchor: the session's from the
  // session, each participant's from their attendance and their client.
  const forSession = await resolveInto({ session: session.id }, boundOn(sessionFields, "session"))
  const perParticipant = await Promise.all(
    session.participants.map(async (p) => {
      const [attendance, client] = await Promise.all([
        resolveInto({ participant: p.id }, boundOn(participantFields, "participant")),
        resolveInto({ client: p.client.id }, boundOn(participantFields, "client")),
      ])
      return { id: p.id, attendance, client }
    }),
  )

  const fresh = {
    sessionData: { ...defaultsFor(sessionFields), ...forSession.data },
    participantData: Object.fromEntries(
      perParticipant.map((p) => [p.id, { ...defaultsFor(participantFields), ...p.attendance.data, ...p.client.data }]),
    ),
  }
  // An unsent draft's answers go back over what ICIS holds now.
  const draft = loadDraft(key, templateId)
  return {
    kind: "draft",
    session,
    caseNumber,
    templateName: template.name,
    sections,
    baseline: {
      session: forSession.baseline,
      participants: Object.fromEntries(
        perParticipant.map((p) => [p.id, { participant: p.attendance.baseline, client: p.client.baseline }]),
      ),
    },
    sessionData: { ...fresh.sessionData, ...(draft?.sessionData ?? {}) },
    participantData: Object.fromEntries(
      Object.entries(fresh.participantData).map(([id, values]) => [id, { ...values, ...(draft?.participantData[id] ?? {}) }]),
    ),
    resumed: draft?.savedAt ?? null,
  }
}

const now = () => new Date().toLocaleString("en-AU", { timeZone: "Australia/Perth" })

export function TemplateNoteView({
  caseNumber,
  sessionId,
  templateId,
}: {
  caseNumber: string
  sessionId: string
  templateId: string
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState<Data>({})
  const [participantData, setParticipantData] = useState<Record<string, Data>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: "info" | "good" | "bad"; text: string } | null>(null)

  const open = useCallback(() => {
    setError(null)
    load(caseNumber, sessionId, templateId).then(
      (l) => {
        setLoaded(l)
        setSessionData(l.sessionData)
        setParticipantData(l.participantData)
      },
      (e: Error) => setError(e.message),
    )
  }, [caseNumber, sessionId, templateId])

  useEffect(() => open(), [open])

  if (error) {
    return (
      <div className="screen">
        <ErrorNote error={error} onRetry={open} />
      </div>
    )
  }
  if (!loaded) {
    return (
      <div className="screen">
        <Loading what="the session and its template" />
      </div>
    )
  }

  const { session, sections } = loaded
  const key = noteKey(caseNumber, session.subject)
  const editing = loaded.kind === "draft"
  const disabled = !editing || busy

  const save = () => {
    saveDraft(key, templateId, { savedAt: now(), sessionData, participantData })
    setNotice({ tone: "info", text: "Draft saved in this browser. Nothing is stored in form-builder or written to ICIS until you submit." })
  }

  const submit = async () => {
    if (loaded.kind !== "draft") return
    const missing = missingRequired(sections, sessionData, participantData, session)
    if (missing.length > 0) {
      setNotice({ tone: "bad", text: `Complete these before submitting: ${missing.join("; ")}.` })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const data = submissionData(sections, sessionData, participantData, session)
      const submission = await submitNote(templateId, data, bindingContext(session, loaded.baseline))
      savePointer(key, {
        templateId,
        templateName: loaded.templateName,
        submissionId: submission.id,
        submittedAt: submission.submittedAt,
      })
      clearDraft(key, templateId)
      open()
    } catch (e) {
      setNotice({
        tone: "bad",
        text:
          e instanceof FormBuilderError && e.missingFieldIds
            ? "Some required fields are missing."
            : `The note wasn't submitted — ${e instanceof Error ? e.message : String(e)}.`,
      })
    } finally {
      setBusy(false)
    }
  }

  const results = loaded.kind === "submitted" ? loaded.results : undefined
  const outcomes = resultLines(sections, session, results)
  const problems = outcomes.filter((o) => o.result.status === "conflict" || o.result.status === "failed").length
  const written = outcomes.filter((o) => o.result.status === "written").length

  return (
    <div className="note-screen">
      <div className="backbar">
        <a href={href({ page: "session", caseNumber, sessionId })}>
          <Icon name="arrowLeft" size={16} />
          Back to session
        </a>
      </div>
      <div className="note-top">
        <div className="note-identity">
          <p>
            COUNSELLING · CASE {caseNumber} · {loaded.templateName.toUpperCase()}
          </p>
          <h1>{session.subject}</h1>
          <span>
            {formatDateTime(session.start)} · {session.participants.map((p) => p.client.displayName).join(" & ")}
          </span>
        </div>
        <div className="note-status">
          {loaded.kind === "submitted" ? (
            <span className="tag good">Note submitted</span>
          ) : (
            <span className="tag warn">{loaded.resumed ? "Draft note" : "New note"}</span>
          )}
          {loaded.kind === "submitted" && <small>Stored in form-builder · {formatDateTime(loaded.submittedAt)}</small>}
          {loaded.kind === "draft" && loaded.resumed && <small>Draft saved {loaded.resumed}</small>}
        </div>
        {editing && (
          <div className="note-actions">
            <button className="button outline" onClick={save} disabled={busy}>
              Save as draft
            </button>
            <button className="button" onClick={submit} disabled={busy}>
              {busy ? "Submitting…" : "Submit session note"}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}
      {loaded.kind === "submitted" && (
        <div className={`notice ${problems > 0 ? "bad" : "good"}`} role="status">
          Submitted{loaded.submittedBy ? ` by ${loaded.submittedBy}` : ""} using {loaded.templateName} (version {loaded.versionNumber}).{" "}
          {problems > 0
            ? `${problems} change${problems === 1 ? "" : "s"} couldn't be saved to ICIS — see the right. The note itself is saved.`
            : written > 0
              ? `${written} change${written === 1 ? "" : "s"} saved to ICIS.`
              : "No ICIS data was changed."}{" "}
          A submitted note can't be edited.
        </div>
      )}

      <div className="note-layout">
        <aside className="note-nav">
          <p>{loaded.templateName.toUpperCase()}</p>
          {sections.map((section, i) => (
            <a
              key={i}
              href={`#section-${i}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(`section-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
            >
              <b>{i + 1}</b>
              <span>
                {section.moduleName || "Session"}
                {section.scope === "participant" && <small>Each participant</small>}
              </span>
            </a>
          ))}
        </aside>

        <div className="note-form">
          {sections.map((section, i) => {
            const bound = section.fields.filter(isBoundField).length
            return (
              <details key={i} id={`section-${i}`} className={`note-module scope-${section.scope}`} open>
                <summary>
                  <b>{i + 1}</b>
                  <span>
                    <h2>{section.moduleName || "Session"}</h2>
                  </span>
                  <span className={`scope-badge ${section.scope}`}>
                    {section.scope === "participant" ? "Each participant" : "Session module"}
                  </span>
                  {bound > 0 && (
                    <span className="icis-count">
                      <Icon name="link" size={12} />
                      {bound} from ICIS
                    </span>
                  )}
                  <Icon name="chevronDown" />
                </summary>
                <div className="module-body">
                  {section.scope === "session" ? (
                    <div className="fields">
                      {section.fields.map((field) => (
                        <TemplateFieldControl
                          key={field.id}
                          field={field}
                          value={sessionData[field.id]}
                          disabled={disabled}
                          onChange={(v) => setSessionData((d) => ({ ...d, [field.id]: v }))}
                        />
                      ))}
                    </div>
                  ) : (
                    session.participants.map((p) => (
                      <div key={p.id} className="participant-copy">
                        <h3>
                          {p.client.displayName}
                          {p.client.clientNumber && <small> · client {p.client.clientNumber}</small>}
                        </h3>
                        <div className="fields">
                          {section.fields.map((field) => (
                            <TemplateFieldControl
                              key={field.id}
                              field={field}
                              value={participantData[p.id]?.[field.id]}
                              disabled={disabled}
                              onChange={(v) =>
                                setParticipantData((d) => ({ ...d, [p.id]: { ...d[p.id], [field.id]: v } }))
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </details>
            )
          })}
        </div>

        <aside className="note-rail">
          <div className="rail-card">
            <p>STORED IN FORM-BUILDER</p>
            <h3>{loaded.kind === "submitted" ? "This note is saved" : "Saved when you submit"}</h3>
            <small className="muted">
              {loaded.kind === "submitted"
                ? "The note is a session-template submission in form-builder, against the version above."
                : "Submitting stores the note in form-builder, which then sends the changed ICIS fields to the Data Binding Service."}
            </small>
          </div>
          {outcomes.length > 0 && (
            <div className="rail-card">
              <p>SAVED WITH THIS NOTE</p>
              <h3>What happened in ICIS</h3>
              <ul className="results">
                {outcomes.map((o) => (
                  <li key={o.id} className={`result ${o.tone}`}>
                    <Icon name={o.tone === "bad" ? "alert" : "check"} size={14} />
                    <span>
                      <strong>{o.label}</strong> — {outcomeText(o.result)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// One line per bound value form-builder tried to write: the field's label,
// with whose value it was for participant fields.
function resultLines(
  sections: SessionTemplateSection[],
  session: SessionAnchor,
  results: SessionTemplateBindingResults | undefined,
) {
  if (!results) return []
  const labelOf = (fields: BoundField[], binding: string) => fields.find((f) => f.binding.key === binding)?.label ?? binding
  const tone = (status: string) =>
    status === "written" ? ("good" as const) : status === "unchanged" || status === "readOnly" ? ("neutral" as const) : ("bad" as const)
  const sessionFields = fieldsOfScope(sections, "session").filter(isBoundField)
  const participantFields = fieldsOfScope(sections, "participant").filter(isBoundField)
  return [
    ...Object.entries(results.session ?? {}).map(([binding, result]) => ({
      id: `session-${binding}`,
      label: labelOf(sessionFields, binding),
      result,
      tone: tone(result.status),
    })),
    ...session.participants.flatMap((p) =>
      Object.entries(results.participants?.[p.id] ?? {}).map(([binding, result]) => ({
        id: `${p.id}-${binding}`,
        label: `${labelOf(participantFields, binding)} (${p.client.displayName})`,
        result,
        tone: tone(result.status),
      })),
    ),
  ]
}
