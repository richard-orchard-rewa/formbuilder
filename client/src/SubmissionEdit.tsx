import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaCells, vanillaRenderers } from "@jsonforms/vanilla-renderers"
import type { SubmissionDetail, SubmissionEdit as SubmissionEditRecord } from "shared"
import {
  editSubmission,
  getSubmission,
  getSubmissionEdits,
  SubmissionRejectedError,
} from "./api.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"

interface SubmissionEditProps {
  formId: string
  formName: string
  submissionId: string
  onBack: () => void
}

type Status = "loading" | "ready" | "error"

// Lets an admin correct a previously submitted submission's values (US-5.2),
// validated against the exact schema version it was captured with rather
// than the form's current active version -- mirroring SubmissionView's
// approach to rendering. Every save records the prior data as an audit-trail
// row, shown below the form.
export function SubmissionEdit({
  formId,
  formName,
  submissionId,
  onBack,
}: SubmissionEditProps) {
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [edits, setEdits] = useState<SubmissionEditRecord[]>([])
  const [status, setStatus] = useState<Status>("loading")
  const [data, setData] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<unknown[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  function load() {
    let cancelled = false
    setStatus("loading")

    Promise.all([
      getSubmission(formId, submissionId),
      getSubmissionEdits(formId, submissionId),
    ])
      .then(([submissionResult, editsResult]) => {
        if (cancelled) return
        setSubmission(submissionResult)
        setData(submissionResult.data)
        setEdits(editsResult)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }

  useEffect(() => load(), [formId, submissionId])

  const { schema, uiSchema } = useMemo(
    () => toJsonSchema(submission?.schema ?? { fields: [] }),
    [submission],
  )

  async function handleSave() {
    if (errors.length > 0) {
      setShowValidation(true)
      return
    }
    setSaveError(null)
    setSaveMessage(null)
    try {
      await editSubmission(formId, submissionId, data)
      setSaveMessage("Saved.")
      load()
    } catch (error) {
      if (error instanceof SubmissionRejectedError) {
        setSaveError("Please fill out all required fields.")
      } else {
        setSaveError("Couldn't save these changes. Please try again.")
      }
    }
  }

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{formName} — Edit submission</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this submission.</p>
      )}

      {status === "ready" && submission && (
        <>
          <p>Captured against version {submission.formVersionNumber}</p>
          {saveError && <p role="alert">{saveError}</p>}
          {saveMessage && <p>{saveMessage}</p>}
          <JsonForms
            schema={schema}
            uischema={uiSchema}
            data={data}
            renderers={vanillaRenderers}
            cells={vanillaCells}
            validationMode={
              showValidation ? "ValidateAndShow" : "ValidateAndHide"
            }
            onChange={({ data, errors }) => {
              setData(data)
              setErrors(errors ?? [])
              setSaveMessage(null)
            }}
          />
          <button type="button" onClick={handleSave}>
            Save changes
          </button>

          <h2>Edit history</h2>
          {edits.length === 0 && <p>No edits yet.</p>}
          {edits.length > 0 && (
            <ul>
              {edits.map((edit) => (
                <li key={edit.id}>
                  {new Date(edit.editedAt).toLocaleString()}
                  {edit.editedBy && ` — ${edit.editedBy}`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
