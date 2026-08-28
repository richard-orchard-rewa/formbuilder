import { useEffect, useState } from "react"
import { FIELD_TYPE_LABELS, type Field, type FieldType } from "shared"
import { getDraft, saveDraft } from "./api.js"
import { FieldPalette } from "./FieldPalette.js"
import { FormCanvas } from "./FormCanvas.js"

interface FormBuilderProps {
  formId: string
  formName: string
  onBack: () => void
}

// Loads the form's current draft, then lets an admin drag field types from
// the palette onto the canvas to build it visually (US-2.1).
export function FormBuilder({ formId, formName, onBack }: FormBuilderProps) {
  const [fields, setFields] = useState<Field[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getDraft(formId)
      .then((draft) => {
        if (cancelled) return
        setFields(draft?.schema.fields ?? [])
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [formId])

  function handleDrop(type: FieldType, index: number) {
    const field: Field = {
      id: crypto.randomUUID(),
      type,
      label: FIELD_TYPE_LABELS[type],
    }
    const next = [...fields.slice(0, index), field, ...fields.slice(index)]
    setFields(next)
    setSaveError(null)
    saveDraft(formId, next).catch(() => {
      setSaveError("Couldn't save this change — it may not persist.")
    })
  }

  return (
    <main className="form-builder">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{formName}</h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load this form.</p>}
      {saveError && <p role="alert">{saveError}</p>}

      {status === "ready" && (
        <div className="form-builder__workspace">
          <FieldPalette />
          <FormCanvas fields={fields} onDrop={handleDrop} />
        </div>
      )}
    </main>
  )
}
