import { useEffect, useState } from "react"
import type { FormVersionSummary, SubmissionSummary } from "shared"
import { getActiveVersion, listFormVersions, listSubmissions } from "./api.js"

interface SubmissionListProps {
  formId: string
  formName: string
  onBack: () => void
  onView: (submissionId: string) => void
  onEdit: (submissionId: string) => void
  // Opens the migration planner for the given source version (US-6.1) --
  // for one submission when `submissionId` is given, otherwise for every
  // submitted submission captured against that version.
  onMigrate: (
    fromVersionId: string,
    fromVersionNumber: number,
    submissionId?: string,
  ) => void
}

type Status = "loading" | "ready" | "error"

// A form's submissions for review/reporting (US-5.1, US-5.3): status,
// captured version, and submission date, filterable by date range and
// schema version.
export function SubmissionList({
  formId,
  formName,
  onBack,
  onView,
  onEdit,
  onMigrate,
}: SubmissionListProps) {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([])
  const [versions, setVersions] = useState<FormVersionSummary[]>([])
  const [activeVersionNumber, setActiveVersionNumber] = useState<
    number | null
  >(null)
  const [status, setStatus] = useState<Status>("loading")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [versionFilter, setVersionFilter] = useState("")

  useEffect(() => {
    listFormVersions(formId)
      .then(setVersions)
      .catch(() => setVersions([]))
    getActiveVersion(formId)
      .then((active) => setActiveVersionNumber(active?.version ?? null))
      .catch(() => setActiveVersionNumber(null))
  }, [formId])

  // A submission can only be migrated forward, onto the form's current
  // active version (US-6.1) -- there's no active version to target, or
  // this submission already targets it.
  function canMigrateFrom(versionNumber: number) {
    return activeVersionNumber !== null && versionNumber !== activeVersionNumber
  }

  function versionIdFor(versionNumber: number) {
    return versions.find((version) => version.version === versionNumber)?.id
  }

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    listSubmissions(formId, {
      from: from || undefined,
      to: to || undefined,
      formVersionNumber: versionFilter ? Number(versionFilter) : undefined,
    })
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
  }, [formId, from, to, versionFilter])

  return (
    <main>
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{formName} — Submissions</h1>
      </header>

      <form
        aria-label="Filter submissions"
        onSubmit={(event) => event.preventDefault()}
      >
        <label>
          From{" "}
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          To{" "}
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label>
          Version{" "}
          <select
            value={versionFilter}
            onChange={(event) => setVersionFilter(event.target.value)}
          >
            <option value="">All</option>
            {versions.map((version) => (
              <option key={version.id} value={version.version}>
                v{version.version}
              </option>
            ))}
          </select>
        </label>
      </form>

      {versionFilter !== "" && canMigrateFrom(Number(versionFilter)) && (
        <p>
          <button
            type="button"
            onClick={() => {
              const fromVersionId = versionIdFor(Number(versionFilter))
              if (fromVersionId) {
                onMigrate(fromVersionId, Number(versionFilter))
              }
            }}
          >
            Migrate all v{versionFilter} submissions to v{activeVersionNumber}
          </button>
        </p>
      )}

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load submissions.</p>}
      {status === "ready" && submissions.length === 0 && (
        <p>No submissions match these filters.</p>
      )}
      {status === "ready" && submissions.length > 0 && (
        <ul>
          {submissions.map((submission) => (
            <li key={submission.id} className="form-list__item">
              <span>
                {submission.status === "draft" ? "Draft" : "Submitted"} — v
                {submission.formVersionNumber} —{" "}
                {new Date(
                  submission.submittedAt ?? submission.createdAt,
                ).toLocaleString()}
              </span>
              <button type="button" onClick={() => onView(submission.id)}>
                View
              </button>
              {submission.status === "submitted" && (
                <button type="button" onClick={() => onEdit(submission.id)}>
                  Edit
                </button>
              )}
              {submission.status === "submitted" &&
                canMigrateFrom(submission.formVersionNumber) && (
                  <button
                    type="button"
                    onClick={() => {
                      const fromVersionId = versionIdFor(
                        submission.formVersionNumber,
                      )
                      if (fromVersionId) {
                        onMigrate(
                          fromVersionId,
                          submission.formVersionNumber,
                          submission.id,
                        )
                      }
                    }}
                  >
                    Migrate to v{activeVersionNumber}
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
