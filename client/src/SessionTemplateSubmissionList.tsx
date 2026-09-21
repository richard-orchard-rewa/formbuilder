import { useEffect, useState } from "react"
import type { SessionTemplateSubmissionSummary } from "shared"
import { listSessionTemplateSubmissions } from "./api.js"

interface SessionTemplateSubmissionListProps {
  sessionTemplateId: string
  sessionTemplateName: string
  onBack: () => void
  onView: (submissionId: string) => void
}

type Status = "loading" | "ready" | "error"

// A session template's submissions for review: which version each was
// captured against, and when -- the natural companion to filling one out
// (US-8.5), mirroring SubmissionList.tsx's shape (without forms' date/
// version filters, which nothing in Epic US-8 asked for).
export function SessionTemplateSubmissionList({
  sessionTemplateId,
  sessionTemplateName,
  onBack,
  onView,
}: SessionTemplateSubmissionListProps) {
  const [submissions, setSubmissions] = useState<SessionTemplateSubmissionSummary[]>(
    [],
  )
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    listSessionTemplateSubmissions(sessionTemplateId)
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
  }, [sessionTemplateId])

  return (
    <main>
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{sessionTemplateName} — Submissions</h1>
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
                v{submission.sessionTemplateVersionNumber} —{" "}
                {new Date(submission.submittedAt).toLocaleString()}
                {submission.submittedBy && ` — ${submission.submittedBy}`}
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
