import { useEffect, useState } from "react"
import type { Field, FormVersion } from "shared"
import { getActiveVersion, SubmissionRejectedError, submitForm } from "./api.js"

interface FormFillProps {
  formId: string
  formName: string
  onBack: () => void
}

type Status = "loading" | "ready" | "no-active" | "error" | "submitted"

// The public-facing view a respondent fills out. Required fields are
// enforced two ways: natively via HTML `required` here, and again by the
// server at submission time in case that's ever bypassed (US-3.5).
export function FormFill({ formId, formName, onBack }: FormFillProps) {
  const [version, setVersion] = useState<FormVersion | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getActiveVersion(formId)
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
  }, [formId])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    const data: Record<string, unknown> = {}
    new FormData(event.currentTarget).forEach((value, key) => {
      data[key] = value
    })
    try {
      await submitForm(formId, data)
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

      {status === "ready" && version && (
        <form onSubmit={handleSubmit}>
          {version.schema.fields.map((field) => (
            <FieldInput key={field.id} field={field} />
          ))}
          <button type="submit">Submit</button>
        </form>
      )}
    </main>
  )
}

function FieldInput({ field }: { field: Field }) {
  return (
    <label className="form-fill__field">
      {field.label}
      {field.required && <span aria-hidden="true"> *</span>}
      {field.type === "textarea" ? (
        <textarea name={field.id} required={field.required} />
      ) : field.type === "text" ? (
        <input
          type="text"
          name={field.id}
          required={field.required}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
        />
      ) : (
        <input type="text" name={field.id} required={field.required} />
      )}
    </label>
  )
}
