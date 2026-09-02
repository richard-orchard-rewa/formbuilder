import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaRenderers } from "@jsonforms/vanilla-renderers"
import type { SubmissionDetail } from "shared"
import { getSubmission } from "./api.js"
import { formCells } from "./schema/formCells.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"

interface SubmissionViewProps {
  formId: string
  formName: string
  submissionId: string
  onBack: () => void
  onViewHistory: () => void
}

type Status = "loading" | "ready" | "error"

// Renders a previously captured submission read-only, against the exact
// schema version it was captured with rather than the form's current
// active version -- so it still renders correctly even after the form has
// since been republished with a different structure (US-5.1).
export function SubmissionView({
  formId,
  formName,
  submissionId,
  onBack,
  onViewHistory,
}: SubmissionViewProps) {
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getSubmission(formId, submissionId)
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
  }, [formId, submissionId])

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
        <h1>{formName} — Submission</h1>
        <button type="button" onClick={onViewHistory}>
          History
        </button>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this submission.</p>
      )}

      {status === "ready" && submission && (
        <>
          <p>
            Captured against version {submission.formVersionNumber} —{" "}
            {submission.status === "draft" ? "draft" : "submitted"}
            {submission.submittedAt &&
              ` on ${new Date(submission.submittedAt).toLocaleString()}`}
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
