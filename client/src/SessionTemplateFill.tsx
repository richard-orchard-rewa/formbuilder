import { useEffect, useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaRenderers } from "@jsonforms/vanilla-renderers"
import type { SessionTemplateVersion } from "shared"
import {
  getSessionTemplateActiveVersion,
  SubmissionRejectedError,
  submitSessionTemplate,
} from "./api.js"
import { formCells } from "./schema/formCells.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"

interface SessionTemplateFillProps {
  sessionTemplateId: string
  sessionTemplateName: string
  onBack: () => void
}

type Status = "loading" | "ready" | "no-active" | "error" | "submitted"

// Fills out and submits a published session template (US-8.5), rendered
// with the same JSON Forms renderer as a form/module preview against the
// combined fields its snapshotted module versions produce. Unlike
// FormFill there's no "save for later" -- out of scope for Epic US-8 (see
// docs/proposals/modules-and-session-templates.md) -- so this is always a
// one-shot submit.
export function SessionTemplateFill({
  sessionTemplateId,
  sessionTemplateName,
  onBack,
}: SessionTemplateFillProps) {
  const [version, setVersion] = useState<SessionTemplateVersion | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [data, setData] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<unknown[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setData({})
    getSessionTemplateActiveVersion(sessionTemplateId)
      .then((active) => {
        if (cancelled) return
        setVersion(active)
        setStatus(active ? "ready" : "no-active")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [sessionTemplateId])

  const { schema, uiSchema } = useMemo(
    () => toJsonSchema(version?.schema ?? { fields: [] }),
    [version],
  )

  async function handleSubmit() {
    if (errors.length > 0) {
      setShowValidation(true)
      return
    }
    setSubmitError(null)
    try {
      await submitSessionTemplate(sessionTemplateId, data)
      setStatus("submitted")
    } catch (error) {
      if (error instanceof SubmissionRejectedError) {
        setSubmitError("Please fill out all required fields.")
      } else {
        setSubmitError("Couldn't submit this session template. Please try again.")
      }
    }
  }

  return (
    <main className="form-fill">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{sessionTemplateName}</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this session template.</p>
      )}
      {status === "no-active" && (
        <p role="alert">This session template hasn't been published yet.</p>
      )}
      {status === "submitted" && <p>Thanks — your response was recorded.</p>}
      {submitError && <p role="alert">{submitError}</p>}

      {status === "ready" && version && (
        <>
          <JsonForms
            schema={schema}
            uischema={uiSchema}
            data={data}
            renderers={vanillaRenderers}
            cells={formCells}
            validationMode={
              showValidation ? "ValidateAndShow" : "ValidateAndHide"
            }
            onChange={({ data, errors }) => {
              setData(data)
              setErrors(errors ?? [])
            }}
          />
          <button type="button" className="primary" onClick={handleSubmit}>
            Submit
          </button>
        </>
      )}
    </main>
  )
}
