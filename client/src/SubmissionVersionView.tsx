import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaRenderers } from "@jsonforms/vanilla-renderers"
import type { SubmissionHistoryDetail } from "shared"
import { getSubmissionVersion } from "./api.js"
import { formCells } from "./schema/formCells.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"

interface SubmissionVersionViewProps {
  formId: string
  formName: string
  submissionId: string
  versionId: string
  onBack: () => void
}

type Status = "loading" | "ready" | "error"

// Opens one specific past version of a submission, read-only, rendered
// against the exact form schema that was active when that version was
// captured (US-6.4). Reachable only from the history timeline
// (SubmissionHistoryList) -- there is no edit or restore action here, and
// the banner below makes clear this isn't the current live version.
export function SubmissionVersionView({
  formId,
  formName,
  submissionId,
  versionId,
  onBack,
}: SubmissionVersionViewProps) {
  const [version, setVersion] = useState<SubmissionHistoryDetail | null>(null)
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getSubmissionVersion(formId, submissionId, versionId)
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
  }, [formId, submissionId, versionId])

  const { schema, uiSchema } = useMemo(
    () => toJsonSchema(version?.schema ?? { fields: [] }),
    [version],
  )

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{formName} — Historical version</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this version.</p>
      )}

      {status === "ready" && version && (
        <>
          <p role="status">
            Historical version, active{" "}
            {new Date(version.activeFrom).toLocaleString()}
            {version.activeTo &&
              ` – ${new Date(version.activeTo).toLocaleString()}`}
            {version.editedBy && ` — edited by ${version.editedBy}`}. Not the
            current version. Read-only.
          </p>
          <JsonForms
            schema={schema}
            uischema={uiSchema}
            data={version.data}
            renderers={vanillaRenderers}
            cells={formCells}
            readonly
          />
        </>
      )}
    </main>
  )
}
