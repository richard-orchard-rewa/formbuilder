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

// Moves the field at sourceIndex so it ends up at targetIndex, where
// targetIndex is expressed in terms of the list *before* the move (as
// produced by the canvas's drop-position calculation).
function reorder(fields: Field[], sourceIndex: number, targetIndex: number) {
  const next = [...fields]
  const [moved] = next.splice(sourceIndex, 1)
  const adjustedTarget =
    targetIndex > sourceIndex ? targetIndex - 1 : targetIndex
  next.splice(adjustedTarget, 0, moved)
  return next
}

// Loads the form's current draft, then lets an admin drag field types from
// the palette onto the canvas to build it visually (US-2.1), and drag
// existing fields to reorder them (US-2.2).
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

  function persist(next: Field[]) {
    setFields(next)
    setSaveError(null)
    saveDraft(formId, next).catch(() => {
      setSaveError("Couldn't save this change — it may not persist.")
    })
  }

  function handleDrop(type: FieldType, index: number) {
    const field: Field = {
      id: crypto.randomUUID(),
      type,
      label: FIELD_TYPE_LABELS[type],
    }
    persist([...fields.slice(0, index), field, ...fields.slice(index)])
  }

  function handleReorder(fieldId: string, index: number) {
    const sourceIndex = fields.findIndex((field) => field.id === fieldId)
    if (sourceIndex === -1) return
    persist(reorder(fields, sourceIndex, index))
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
          <FormCanvas
            fields={fields}
            onDrop={handleDrop}
            onReorder={handleReorder}
          />
        </div>
      )}
    </main>
  )
}
