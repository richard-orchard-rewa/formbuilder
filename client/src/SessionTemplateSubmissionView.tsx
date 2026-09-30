import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaRenderers } from "@jsonforms/vanilla-renderers"
import {
  isBoundField,
  type Field,
  type FieldOption,
  type SessionParticipant,
  type SessionTemplateSubmissionDetail,
} from "shared"
import { getParticipant, getSessionTemplateSubmission } from "./api.js"
import { BindingResultsSummary } from "./BindingResultsSummary.js"
import { formCells } from "./schema/formCells.js"
import { participantsOf, sectionsOf } from "./schema/sections.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"
import { useBindingOptions } from "./schema/useBindingOptions.js"

interface SessionTemplateSubmissionViewProps {
  sessionTemplateId: string
  sessionTemplateName: string
  submissionId: string
  onBack: () => void
}

type Status = "loading" | "ready" | "error"

// Renders a previously captured session template submission read-only,
// against the exact schema it was captured with -- mirrors SubmissionView.tsx.
// Each participant's copy of a once-per-participant section is read back
// from under their participant anchor, and labelled with who that anchor
// is as ICIS has it now, so every copy is shown against the right client.
export function SessionTemplateSubmissionView({
  sessionTemplateId,
  sessionTemplateName,
  submissionId,
  onBack,
}: SessionTemplateSubmissionViewProps) {
  const [submission, setSubmission] = useState<SessionTemplateSubmissionDetail | null>(
    null,
  )
  const [status, setStatus] = useState<Status>("loading")
  const [people, setPeople] = useState<Record<string, SessionParticipant | null>>({})

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getSessionTemplateSubmission(sessionTemplateId, submissionId)
      .then((result) => {
        if (cancelled) return
        setSubmission(result)
        setStatus("ready")
        // Best-effort: without the DBS, copies are still shown, numbered.
        const ids = Object.keys(participantsOf(result.data))
        Promise.all(
          ids.map((id) =>
            getParticipant(id)
              .catch(() => null)
              .then((p) => [id, p] as const),
          ),
        ).then((entries) => {
          if (!cancelled) setPeople(Object.fromEntries(entries))
        })
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [sessionTemplateId, submissionId])

  const sections = useMemo(
    () => (submission ? sectionsOf(submission.schema) : []),
    [submission],
  )
  const bindingOptions = useBindingOptions(sections.flatMap((s) => s.fields))
  // Stored keyed by anchor, whose order the database doesn't keep: shown
  // by name once the people are known.
  const participantIds = (submission ? Object.keys(participantsOf(submission.data)) : []).sort(
    (a, b) =>
      (people[a]?.client.displayName ?? a).localeCompare(people[b]?.client.displayName ?? b),
  )
  const nameOf = (id: string, index: number) =>
    people[id]?.client.displayName ?? `Participant ${index + 1}`
  const boundIn = (scope: "session" | "participant") =>
    sections
      .filter((s) => s.scope === scope)
      .flatMap((s) => s.fields)
      .filter(isBoundField)

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{sessionTemplateName} — Submission</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load this submission.</p>}

      {status === "ready" && submission && (
        <>
          <p>
            Captured against version {submission.sessionTemplateVersionNumber}
            {submission.submittedBy && ` — submitted by ${submission.submittedBy}`}{" "}
            on {new Date(submission.submittedAt).toLocaleString()}
          </p>
          {sections.map((section, index) =>
            section.scope === "session" ? (
              <section
                key={`${section.moduleId}-${index}`}
                className="session-section"
                aria-label={section.moduleName || "Session"}
              >
                {section.moduleName && <h2>{section.moduleName}</h2>}
                <ReadOnlySection
                  fields={section.fields}
                  data={submission.data}
                  options={bindingOptions}
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
                {participantIds.map((id, n) => (
                  <section
                    key={id}
                    className="session-section__participant"
                    aria-label={`${section.moduleName} — ${nameOf(id, n)}`}
                  >
                    <h3>{nameOf(id, n)}</h3>
                    <ReadOnlySection
                      fields={section.fields}
                      data={participantsOf(submission.data)[id] ?? {}}
                      options={bindingOptions}
                    />
                  </section>
                ))}
              </section>
            ),
          )}
          {submission.bindingResults?.session && (
            <BindingResultsSummary
              heading="Session record"
              fields={boundIn("session")}
              results={submission.bindingResults.session}
              options={bindingOptions}
            />
          )}
          {participantIds.map((id, n) =>
            submission.bindingResults?.participants?.[id] ? (
              <BindingResultsSummary
                key={id}
                heading={nameOf(id, n)}
                fields={boundIn("participant")}
                results={submission.bindingResults.participants[id]}
                options={bindingOptions}
              />
            ) : null,
          )}
        </>
      )}
    </main>
  )
}

function ReadOnlySection({
  fields,
  data,
  options,
}: {
  fields: Field[]
  data: Record<string, unknown>
  options: Record<string, FieldOption[]>
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
      readonly
    />
  )
}
