import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaRenderers } from "@jsonforms/vanilla-renderers"
import {
  isBoundField,
  type BindingAnchor,
  type BoundField,
  type BoundValues,
  type Field,
  type FieldOption,
  type SessionAnchor,
  type SessionTemplateBindingContext,
  type SessionTemplateBindingResults,
  type SessionTemplateVersion,
} from "shared"
import {
  findSessions,
  getSessionTemplateActiveVersion,
  resolveBindings,
  SubmissionRejectedError,
  submitSessionTemplate,
} from "./api.js"
import { BindingResultsSummary } from "./BindingResultsSummary.js"
import { formCells } from "./schema/formCells.js"
import { sectionsOf } from "./schema/sections.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"
import { useBindingOptions } from "./schema/useBindingOptions.js"

interface SessionTemplateFillProps {
  sessionTemplateId: string
  sessionTemplateName: string
  onBack: () => void
}

type Status = "loading" | "ready" | "no-active" | "error" | "submitted"
type Data = Record<string, unknown>

const boundOn = (fields: Field[], anchor: BindingAnchor) =>
  fields.filter(isBoundField).filter((field) => field.binding.anchor === anchor)

// The answers a field starts with: a dropdown/radio's default option and a
// checkbox's default state. The JSON Schema `default` alone isn't applied to
// the form's data, so a required dropdown with a default would otherwise
// start empty and block the submit.
function defaultsFor(fields: Field[]): Data {
  const data: Data = {}
  for (const field of fields) {
    if ((field.type === "dropdown" || field.type === "radio") && field.defaultValue !== undefined) {
      data[field.id] = field.defaultValue
    } else if (field.type === "checkbox" && field.defaultChecked) {
      data[field.id] = true
    }
  }
  return data
}

// Resolves `fields`' bindings against one anchor, returning the values by
// binding key and the same values keyed by field id for the form's data.
async function resolveInto(
  anchor: Parameters<typeof resolveBindings>[0],
  fields: BoundField[],
): Promise<{ baseline: BoundValues; data: Data }> {
  if (fields.length === 0) return { baseline: {}, data: {} }
  const { values } = await resolveBindings(anchor, [
    ...new Set(fields.map((field) => field.binding.key)),
  ])
  const data: Data = {}
  for (const field of fields) {
    const value = values[field.binding.key]
    if (value !== null && value !== undefined) data[field.id] = value
  }
  return { baseline: values, data }
}

// Fills out and submits a published session template (US-8.5), one
// section per module, rendered with the same JSON Forms renderer as a
// form/module preview. A once-per-participant module is filled in once for
// each person in the chosen session, each copy held under that person's
// participant anchor -- so what's written back, and what's read back
// later, belongs to the right client (docs/proposals/databound-fields.md,
// "Anchors beyond the client"). No "save for later" -- out of scope for
// Epic US-8 -- so this is always a one-shot submit.
export function SessionTemplateFill({
  sessionTemplateId,
  sessionTemplateName,
  onBack,
}: SessionTemplateFillProps) {
  const [version, setVersion] = useState<SessionTemplateVersion | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [sessionData, setSessionData] = useState<Data>({})
  const [participantData, setParticipantData] = useState<Record<string, Data>>({})
  const [errors, setErrors] = useState<Record<string, unknown[]>>({})
  const [showValidation, setShowValidation] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [session, setSession] = useState<SessionAnchor | null>(null)
  const [baseline, setBaseline] = useState<SessionTemplateBindingContext["baseline"]>()
  const [results, setResults] = useState<SessionTemplateBindingResults | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setSessionData({})
    setParticipantData({})
    getSessionTemplateActiveVersion(sessionTemplateId)
      .then((active) => {
        if (cancelled) return
        setVersion(active)
        if (active) {
          setSessionData(
            defaultsFor(
              sectionsOf(active.schema)
                .filter((s) => s.scope === "session")
                .flatMap((s) => s.fields),
            ),
          )
        }
        setStatus(active ? "ready" : "no-active")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [sessionTemplateId])

  const sections = useMemo(() => (version ? sectionsOf(version.schema) : []), [version])
  const allFields = useMemo(() => sections.flatMap((s) => s.fields), [sections])
  const sessionFields = useMemo(
    () => sections.filter((s) => s.scope === "session").flatMap((s) => s.fields),
    [sections],
  )
  const participantFields = useMemo(
    () => sections.filter((s) => s.scope === "participant").flatMap((s) => s.fields),
    [sections],
  )
  const bindingOptions = useBindingOptions(allFields)
  const needsSession =
    participantFields.length > 0 || allFields.some(isBoundField)

  // Choosing a session fills every bound field from its own anchor: the
  // session's from the session, and each participant copy's from that
  // participant's attendance record and client.
  async function handleSessionChosen(chosen: SessionAnchor) {
    const forSession = await resolveInto({ session: chosen.id }, boundOn(sessionFields, "session"))
    const perParticipant = await Promise.all(
      chosen.participants.map(async (p) => {
        const [attendance, client] = await Promise.all([
          resolveInto({ participant: p.id }, boundOn(participantFields, "participant")),
          resolveInto({ client: p.client.id }, boundOn(participantFields, "client")),
        ])
        return { id: p.id, attendance, client }
      }),
    )
    setSession(chosen)
    setSessionData((current) => ({ ...current, ...forSession.data }))
    setParticipantData(
      Object.fromEntries(
        perParticipant.map((p) => [
          p.id,
          { ...defaultsFor(participantFields), ...p.attendance.data, ...p.client.data },
        ]),
      ),
    )
    setBaseline({
      session: forSession.baseline,
      participants: Object.fromEntries(
        perParticipant.map((p) => [
          p.id,
          { participant: p.attendance.baseline, client: p.client.baseline },
        ]),
      ),
    })
    setErrors({})
  }

  async function handleSubmit() {
    if (participantFields.length > 0 && !session) {
      setSubmitError("Choose a session first — some sections are filled in for each participant.")
      return
    }
    if (Object.values(errors).some((list) => list.length > 0)) {
      setShowValidation(true)
      setSubmitError("Please fill out all required fields.")
      return
    }
    setSubmitError(null)
    const data: Data = {
      ...sessionData,
      ...(session && participantFields.length > 0
        ? {
            participants: Object.fromEntries(
              session.participants.map((p) => [p.id, participantData[p.id] ?? {}]),
            ),
          }
        : {}),
    }
    try {
      const submission = await submitSessionTemplate(
        sessionTemplateId,
        data,
        session
          ? {
              session: session.id,
              participants: session.participants.map((p) => ({
                participant: p.id,
                client: p.client.id,
              })),
              baseline,
            }
          : undefined,
      )
      setResults(submission.bindingResults ?? null)
      setStatus("submitted")
    } catch (error) {
      if (error instanceof SubmissionRejectedError) {
        setSubmitError("Please fill out all required fields.")
      } else {
        setSubmitError("Couldn't submit this session template. Please try again.")
      }
    }
  }

  const setInstanceErrors = (key: string, list: unknown[]) =>
    setErrors((current) => ({ ...current, [key]: list }))

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{sessionTemplateName}</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this session template.</p>
      )}
      {status === "no-active" && (
        <p role="alert">This session template hasn't been published yet.</p>
      )}
      {status === "submitted" && <p>Thanks — your response was recorded.</p>}
      {status === "submitted" && results && session && (
        <SessionResults
          session={session}
          results={results}
          sessionFields={sessionFields.filter(isBoundField)}
          participantFields={participantFields.filter(isBoundField)}
          options={bindingOptions}
        />
      )}
      {submitError && <p role="alert">{submitError}</p>}

      {status === "ready" && version && (
        <>
          {needsSession && <SessionPicker session={session} onChosen={handleSessionChosen} />}
          {sections.map((section, index) =>
            section.scope === "session" ? (
              <section
                key={`${section.moduleId}-${index}`}
                className="session-section"
                aria-label={section.moduleName || "Session"}
              >
                {section.moduleName && <h2>{section.moduleName}</h2>}
                <SectionForm
                  fields={section.fields}
                  data={sessionData}
                  options={bindingOptions}
                  showValidation={showValidation}
                  onChange={(next, list) => {
                    setSessionData(next)
                    setInstanceErrors(`session:${index}`, list)
                  }}
                />
              </section>
            ) : (
              <section
                key={`${section.moduleId}-${index}`}
                className="session-section"
                aria-label={section.moduleName}
              >
                <h2>
                  {section.moduleName}{" "}
                  <span className="session-section__scope">· once per participant</span>
                </h2>
                {!session && (
                  <p className="field-palette__note">
                    Choose a session to fill this in for each participant.
                  </p>
                )}
                {session?.participants.map((p) => (
                  <section
                    key={p.id}
                    className="session-section__participant"
                    aria-label={`${section.moduleName} — ${p.client.displayName}`}
                  >
                    <h3>
                      {p.client.displayName}
                      {p.client.clientNumber && <> ({p.client.clientNumber})</>}
                    </h3>
                    <SectionForm
                      fields={section.fields}
                      data={participantData[p.id] ?? {}}
                      options={bindingOptions}
                      showValidation={showValidation}
                      onChange={(next, list) => {
                        setParticipantData((current) => ({ ...current, [p.id]: next }))
                        setInstanceErrors(`${p.id}:${index}`, list)
                      }}
                    />
                  </section>
                ))}
              </section>
            ),
          )}
          <button type="button" className="primary" onClick={handleSubmit}>
            Submit
          </button>
        </>
      )}
    </main>
  )
}

// One section (or one participant's copy of it) as its own JSON Forms
// instance over its own slice of the data.
function SectionForm({
  fields,
  data,
  options,
  showValidation,
  onChange,
}: {
  fields: Field[]
  data: Data
  options: Record<string, FieldOption[]>
  showValidation: boolean
  onChange: (data: Data, errors: unknown[]) => void
}) {
  const { schema, uiSchema } = useMemo(
    () => toJsonSchema({ fields }, { bindingOptions: options }),
    [fields, options],
  )
  return (
    <JsonForms
      schema={schema}
      uischema={uiSchema}
      data={data}
      renderers={vanillaRenderers}
      cells={formCells}
      validationMode={showValidation ? "ValidateAndShow" : "ValidateAndHide"}
      onChange={({ data, errors }) => onChange(data as Data, errors ?? [])}
    />
  )
}

function formatStart(start: string | null) {
  return start
    ? new Date(start).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "No time set"
}

// Chooses which session a note is for, and so who it's for. In the real
// system the session-notes app opens a session's note (requirements §9);
// the prototype finds a client's sessions by their ICIS client number.
function SessionPicker({
  session,
  onChosen,
}: {
  session: SessionAnchor | null
  onChosen: (session: SessionAnchor) => Promise<void>
}) {
  const [clientNumber, setClientNumber] = useState("")
  const [sessions, setSessions] = useState<SessionAnchor[] | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "not-found" | "error">("idle")

  async function find() {
    setState("loading")
    try {
      const found = await findSessions(clientNumber.trim())
      setSessions(found)
      setState(found ? "idle" : "not-found")
    } catch {
      setState("error")
    }
  }

  async function choose(chosen: SessionAnchor) {
    setState("loading")
    try {
      await onChosen(chosen)
      setSessions(null)
      setState("idle")
    } catch {
      setState("error")
    }
  }

  return (
    <section className="client-picker" aria-label="Session">
      {session ? (
        <p className="client-picker__current">
          Session: <strong>{session.subject ?? "Untitled session"}</strong>,{" "}
          {formatStart(session.start)} — with{" "}
          {session.participants.map((p) => p.client.displayName).join(", ")}
        </p>
      ) : (
        <p className="client-picker__current">
          This note is for a session. Find a client's sessions to choose one.
        </p>
      )}
      <form
        className="client-picker__form"
        onSubmit={(event) => {
          event.preventDefault()
          if (clientNumber.trim()) void find()
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
          {state === "loading" ? "Loading…" : "Find sessions"}
        </button>
      </form>
      {sessions && sessions.length === 0 && <p>That client has no sessions.</p>}
      {sessions && sessions.length > 0 && (
        <ul className="session-picker__list">
          {sessions.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => void choose(s)}>
                {s.subject ?? "Untitled session"} — {formatStart(s.start)}
              </button>{" "}
              <span className="session-picker__people">
                {s.participants
                  .map((p) => `${p.client.displayName}${p.attendance ? ` (${p.attendance})` : ""}`)
                  .join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {state === "not-found" && <p role="alert">No client found with that number.</p>}
      {state === "error" && <p role="alert">Couldn't reach the Data Binding Service.</p>}
    </section>
  )
}

// After submit: what happened to each bound value, for the session and for
// each participant by name.
function SessionResults({
  session,
  results,
  sessionFields,
  participantFields,
  options,
}: {
  session: SessionAnchor
  results: SessionTemplateBindingResults
  sessionFields: BoundField[]
  participantFields: BoundField[]
  options: Record<string, FieldOption[]>
}) {
  return (
    <>
      {results.session && (
        <BindingResultsSummary
          heading="Session record"
          fields={sessionFields}
          results={results.session}
          options={options}
        />
      )}
      {session.participants.map((p) =>
        results.participants?.[p.id] ? (
          <BindingResultsSummary
            key={p.id}
            heading={p.client.displayName}
            fields={participantFields}
            results={results.participants[p.id]}
            options={options}
          />
        ) : null,
      )}
    </>
  )
}
