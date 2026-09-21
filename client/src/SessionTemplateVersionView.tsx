import { useEffect, useState } from "react"
import type { SessionTemplateVersion } from "shared"
import { getSessionTemplateVersion } from "./api.js"
import { FormPreview } from "./FormPreview.js"

interface SessionTemplateVersionViewProps {
  sessionTemplateId: string
  sessionTemplateName: string
  versionId: string
  onBack: () => void
}

type Status = "loading" | "ready" | "error"

// Opens one specific past version of a session template, read-only:
// exactly which module -- at which of its versions -- it snapshotted, in
// order (US-8.8), plus a read-only preview of the combined fields that
// version produced. Mirrors SubmissionVersionView.tsx's shape.
export function SessionTemplateVersionView({
  sessionTemplateId,
  sessionTemplateName,
  versionId,
  onBack,
}: SessionTemplateVersionViewProps) {
  const [version, setVersion] = useState<SessionTemplateVersion | null>(null)
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getSessionTemplateVersion(sessionTemplateId, versionId)
      .then((result) => {
        if (cancelled) return
        setVersion(result)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [sessionTemplateId, versionId])

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{sessionTemplateName} — Historical version</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load this version.</p>}
      {status === "ready" && !version && <p role="alert">Version not found.</p>}

      {status === "ready" && version && (
        <>
          <p role="status">
            v{version.version}, published{" "}
            {new Date(version.publishedAt).toLocaleString()}
            {version.publishedBy && ` by ${version.publishedBy}`}. Not
            necessarily the current version. Read-only.
          </p>
          <ol>
            {version.modules.map((mod) => (
              <li key={mod.moduleId}>
                {mod.moduleName} — v{mod.moduleVersionNumber}
              </li>
            ))}
          </ol>
          <FormPreview fields={version.schema.fields} />
        </>
      )}
    </main>
  )
}
