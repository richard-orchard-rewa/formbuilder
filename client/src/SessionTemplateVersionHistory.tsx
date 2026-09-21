import { useEffect, useState } from "react"
import type { SessionTemplateVersionSummary } from "shared"
import { listSessionTemplateVersions } from "./api.js"

interface SessionTemplateVersionHistoryProps {
  sessionTemplateId: string
  sessionTemplateName: string
  onBack: () => void
  onSelectVersion: (versionId: string) => void
}

type Status = "loading" | "ready" | "error"

// A timeline of a session template's published versions (US-8.7): version
// number, when it was published, and by whom -- mirrors
// SubmissionHistory.tsx's shape.
export function SessionTemplateVersionHistory({
  sessionTemplateId,
  sessionTemplateName,
  onBack,
  onSelectVersion,
}: SessionTemplateVersionHistoryProps) {
  const [versions, setVersions] = useState<SessionTemplateVersionSummary[]>([])
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    listSessionTemplateVersions(sessionTemplateId)
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
  }, [sessionTemplateId])

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{sessionTemplateName} — Version history</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this session template's history.</p>
      )}
      {status === "ready" && versions.length === 0 && (
        <p>Not published yet.</p>
      )}
      {status === "ready" && versions.length > 0 && (
        <ul>
          {versions.map((version) => (
            <li key={version.id} className="form-list__item">
              <span>
                v{version.version} — {version.status} —{" "}
                {new Date(version.publishedAt).toLocaleString()}
                {version.publishedBy && ` — ${version.publishedBy}`}
              </span>
              <button
                type="button"
                onClick={() => onSelectVersion(version.id)}
              >
                View
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
