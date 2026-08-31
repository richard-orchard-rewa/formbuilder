import { useEffect, useState } from "react"
import type { Field } from "shared"

interface FieldInspectorProps {
  field: Field | null
  onChange: (field: Field) => void
  onDelete: (fieldId: string) => void
  isPublished: (fieldId: string) => boolean
}

// Configuration panel for the field selected on the canvas. Only "text"
// has type-specific options so far (US-3.1); other types grow their own
// as their field-types epic issues land.
export function FieldInspector({
  field,
  onChange,
  onDelete,
  isPublished,
}: FieldInspectorProps) {
  // Tracks the label input's own text so an admin can pass through an
  // empty string while typing (e.g. selecting-all to retype) without that
  // getting persisted as an invalid label (US-2.3). Only a non-empty,
  // trimmed value is ever forwarded to onChange.
  const [labelDraft, setLabelDraft] = useState(field?.label ?? "")

  useEffect(() => {
    setLabelDraft(field?.label ?? "")
  }, [field?.id])

  if (!field) {
    return (
      <aside className="field-inspector">
        <h2>Field settings</h2>
        <p className="field-inspector__empty">
          Select a field on the canvas to configure it.
        </p>
      </aside>
    )
  }

  const labelIsEmpty = labelDraft.trim().length === 0
  const fieldId = field.id

  function handleDelete() {
    if (
      isPublished(fieldId) &&
      !window.confirm(
        "This field is part of a previously published version of this form. Deleting it won't affect submissions already collected, but it will be gone from every future version. Delete anyway?",
      )
    ) {
      return
    }
    onDelete(fieldId)
  }

  return (
    <aside className="field-inspector">
      <h2>Field settings</h2>
      <label className="field-inspector__field">
        Label
        <input
          type="text"
          value={labelDraft}
          onChange={(event) => {
            const value = event.target.value
            setLabelDraft(value)
            if (value.trim().length > 0) {
              onChange({ ...field, label: value })
            }
          }}
        />
        {labelIsEmpty && (
          <span className="field-inspector__error" role="alert">
            Label can't be empty.
          </span>
        )}
      </label>

      {field.type === "text" && (
        <>
          <label className="field-inspector__field">
            Placeholder
            <input
              type="text"
              value={field.placeholder ?? ""}
              onChange={(event) =>
                onChange({
                  ...field,
                  placeholder: event.target.value || undefined,
                })
              }
            />
          </label>
          <label className="field-inspector__field field-inspector__field--checkbox">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) =>
                onChange({ ...field, required: event.target.checked })
              }
            />
            Required
          </label>
          <label className="field-inspector__field">
            Max length
            <input
              type="number"
              min={1}
              value={field.maxLength ?? ""}
              onChange={(event) => {
                const value = event.target.valueAsNumber
                onChange({
                  ...field,
                  maxLength: Number.isNaN(value) ? undefined : value,
                })
              }}
            />
          </label>
        </>
      )}

      <button
        type="button"
        className="field-inspector__delete"
        onClick={handleDelete}
      >
        Delete field
      </button>
    </aside>
  )
}
