import { useEffect, useState } from "react"
import { FIELD_TYPE_LABELS, type Field, type FieldType } from "shared"
import { getDraft, saveDraft } from "./api.js"
import { FieldInspector } from "./FieldInspector.js"
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

function createField(type: FieldType): Field {
  const id = crypto.randomUUID()
  const label = FIELD_TYPE_LABELS[type]
  switch (type) {
    case "text":
      return { id, type, label, required: false }
    case "textarea":
      return { id, type, label }
    case "dropdown":
      return { id, type, label, required: false, options: [] }
  }
}

// Loads the form's current draft, then lets an admin drag field types from
// the palette onto the canvas to build it visually (US-2.1), reorder them
// (US-2.2), and configure the selected field (US-3.x).
export function FormBuilder({ formId, formName, onBack }: FormBuilderProps) {
  const [fields, setFields] = useState<Field[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
    const field = createField(type)
    persist([...fields.slice(0, index), field, ...fields.slice(index)])
    setSelectedId(field.id)
  }

  function handleReorder(fieldId: string, index: number) {
    const sourceIndex = fields.findIndex((field) => field.id === fieldId)
    if (sourceIndex === -1) return
    persist(reorder(fields, sourceIndex, index))
  }

  function handleFieldChange(next: Field) {
    persist(fields.map((field) => (field.id === next.id ? next : field)))
  }

  const selectedField = fields.find((field) => field.id === selectedId) ?? null

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
            selectedId={selectedId}
            onDrop={handleDrop}
            onReorder={handleReorder}
            onSelect={setSelectedId}
          />
          <FieldInspector field={selectedField} onChange={handleFieldChange} />
        </div>
      )}
    </main>
  )
}
