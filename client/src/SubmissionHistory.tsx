import { useEffect, useState } from "react"
import type { SubmissionHistory as SubmissionHistoryEntry } from "shared"
import { getSubmissionHistory } from "./api.js"
import { SubmissionHistoryList } from "./SubmissionHistoryList.js"

interface SubmissionHistoryProps {
  formId: string
  formName: string
  submissionId: string
  onBack: () => void
}

type Status = "loading" | "ready" | "error"

// Lets an admin see that a submission was edited before digging into what
// changed (US-6.3): a timeline of its previous versions, most recent first,
// with who changed it and when. Reachable from the submission detail
// screen (SubmissionView).
export function SubmissionHistory({
  formId,
  formName,
  submissionId,
  onBack,
}: SubmissionHistoryProps) {
  const [versions, setVersions] = useState<SubmissionHistoryEntry[]>([])
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getSubmissionHistory(formId, submissionId)
      .then((result) => {
        if (cancelled) return
        setVersions(result)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [formId, submissionId])

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{formName} — Submission history</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this submission's history.</p>
      )}
      {status === "ready" && <SubmissionHistoryList versions={versions} />}
    </main>
  )
}
