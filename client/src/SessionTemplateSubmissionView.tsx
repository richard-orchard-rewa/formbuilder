import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaRenderers } from "@jsonforms/vanilla-renderers"
import type { SessionTemplateSubmissionDetail } from "shared"
import { getSessionTemplateSubmission } from "./api.js"
import { formCells } from "./schema/formCells.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"

interface SessionTemplateSubmissionViewProps {
  sessionTemplateId: string
  sessionTemplateName: string
  submissionId: string
  onBack: () => void
}

type Status = "loading" | "ready" | "error"

// Renders a previously captured session template submission read-only,
// against the exact combined schema it was captured with -- mirrors
// SubmissionView.tsx.
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

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getSessionTemplateSubmission(sessionTemplateId, submissionId)
      .then((result) => {
        if (cancelled) return
        setSubmission(result)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [sessionTemplateId, submissionId])

  const { schema, uiSchema } = useMemo(
    () => toJsonSchema(submission?.schema ?? { fields: [] }),
    [submission],
  )

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
          <JsonForms
            schema={schema}
            uischema={uiSchema}
            data={submission.data}
            renderers={vanillaRenderers}
            cells={formCells}
            readonly
          />
        </>
      )}
    </main>
  )
}
