import { useEffect, useState } from "react"
import type { SubmissionSummary } from "shared"
import { listSubmissions } from "./api.js"

interface SubmissionListProps {
  formId: string
  formName: string
  onBack: () => void
  onView: (submissionId: string) => void
}

type Status = "loading" | "ready" | "error"

// A bare-bones, unfiltered list of a form's submissions -- just enough for
// an admin to navigate to one and view it (US-5.1). Filtering by date
// range/version and richer status/version columns are US-5.3's job.
export function SubmissionList({
  formId,
  formName,
  onBack,
  onView,
}: SubmissionListProps) {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([])
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    listSubmissions(formId)
      .then((result) => {
        if (cancelled) return
        setSubmissions(result)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [formId])

  return (
    <main>
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{formName} — Submissions</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load submissions.</p>}
      {status === "ready" && submissions.length === 0 && (
        <p>No submissions yet.</p>
      )}
      {status === "ready" && submissions.length > 0 && (
        <ul>
          {submissions.map((submission) => (
            <li key={submission.id} className="form-list__item">
              <span>
                {submission.status === "draft" ? "Draft" : "Submitted"} —{" "}
                {new Date(
                  submission.submittedAt ?? submission.createdAt,
                ).toLocaleString()}
              </span>
              <button type="button" onClick={() => onView(submission.id)}>
                View
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
