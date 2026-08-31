import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaCells, vanillaRenderers } from "@jsonforms/vanilla-renderers"
import type { FormVersion } from "shared"
import {
  getActiveVersion,
  getDraftSubmission,
  saveDraftSubmission,
  submitForm,
  SubmissionRejectedError,
} from "./api.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"

interface FormFillProps {
  formId: string
  formName: string
  onBack: () => void
}

type Status = "loading" | "ready" | "no-active" | "error" | "submitted"

// Remembers the in-progress draft's id per form (US-4.3), so returning to
// the same form later resumes it instead of starting over. Reads/writes
// are wrapped in try/catch since localStorage can be unavailable (private
// browsing, blocked site data) -- when it is, saving a draft still works
// for the current visit, it just won't be resumable after a reload.
function draftStorageKey(formId: string) {
  return `form-fill-draft:${formId}`
}

function readSavedDraftId(formId: string): string | null {
  try {
    return window.localStorage.getItem(draftStorageKey(formId))
  } catch {
    return null
  }
}

function writeSavedDraftId(formId: string, submissionId: string) {
  try {
    window.localStorage.setItem(draftStorageKey(formId), submissionId)
  } catch {
    // Best-effort only.
  }
}

function clearSavedDraftId(formId: string) {
  try {
    window.localStorage.removeItem(draftStorageKey(formId))
  } catch {
    // Best-effort only.
  }
}

// The public-facing view a respondent fills out, rendered with the same
// JSON Forms renderer used by the builder's preview (ADR-0003) so the UI
// always matches the active schema version's field types and constraints
// (US-4.1). Required fields and type constraints (enum, number range,
// date bounds, ...) are validated client-side by JSON Forms/ajv against
// the generated JSON Schema, and independently re-checked by the server
// at submission time in case that's ever bypassed (US-3.5).
export function FormFill({ formId, formName, onBack }: FormFillProps) {
  const [version, setVersion] = useState<FormVersion | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [data, setData] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<unknown[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setSubmissionId(null)
    setDraftMessage(null)

    async function load() {
      const active = await getActiveVersion(formId)
      if (cancelled) return
      setVersion(active)
      if (!active) {
        setStatus("no-active")
        return
      }

      const savedDraftId = readSavedDraftId(formId)
      const draft = savedDraftId
        ? await getDraftSubmission(formId, savedDraftId)
        : null
      if (cancelled) return

      if (draft) {
        setData(draft.data)
        setSubmissionId(draft.id)
      } else {
        if (savedDraftId) clearSavedDraftId(formId)
        setData({})
      }
      setStatus("ready")
    }

    load().catch(() => {
      if (!cancelled) setStatus("error")
    })

    return () => {
      cancelled = true
    }
  }, [formId])

  const { schema, uiSchema } = useMemo(
    () => toJsonSchema(version?.schema ?? { fields: [] }),
    [version],
  )

  async function handleSaveDraft() {
    setSubmitError(null)
    try {
      const draft = await saveDraftSubmission(
        formId,
        data,
        submissionId ?? undefined,
      )
      setSubmissionId(draft.id)
      writeSavedDraftId(formId, draft.id)
      setDraftMessage("Saved — you can return later to finish this form.")
    } catch {
      setDraftMessage(null)
      setSubmitError("Couldn't save this draft. Please try again.")
    }
  }

  async function handleSubmit() {
    if (errors.length > 0) {
      setShowValidation(true)
      return
    }
    setSubmitError(null)
    try {
      await submitForm(formId, data, submissionId ?? undefined)
      clearSavedDraftId(formId)
      setStatus("submitted")
    } catch (error) {
      if (error instanceof SubmissionRejectedError) {
        setSubmitError("Please fill out all required fields.")
      } else {
        setSubmitError("Couldn't submit this form. Please try again.")
      }
    }
  }

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{formName}</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load this form.</p>}
      {status === "no-active" && (
        <p role="alert">This form hasn't been published yet.</p>
      )}
      {status === "submitted" && <p>Thanks — your response was recorded.</p>}
      {submitError && <p role="alert">{submitError}</p>}
      {draftMessage && <p>{draftMessage}</p>}

      {status === "ready" && version && (
        <>
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
              setDraftMessage(null)
            }}
          />
          <button type="button" onClick={handleSaveDraft}>
            Save for later
          </button>
          <button type="button" onClick={handleSubmit}>
            Submit
          </button>
        </>
      )}
    </main>
  )
}
