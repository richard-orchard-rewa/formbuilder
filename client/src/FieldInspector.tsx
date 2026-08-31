import type { Field } from "shared"

interface FieldInspectorProps {
  field: Field | null
  onChange: (field: Field) => void
}

// Configuration panel for the field selected on the canvas. Label and
// required apply to every field type (US-3.5); type-specific options
// (like "text"'s placeholder/maxLength, US-3.1) grow as their own
// field-types epic issues land.
export function FieldInspector({ field, onChange }: FieldInspectorProps) {
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

  return (
    <aside className="field-inspector">
      <h2>Field settings</h2>
      <label className="field-inspector__field">
        Label
        <input
          type="text"
          value={field.label}
          onChange={(event) =>
            onChange({ ...field, label: event.target.value })
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
    </aside>
  )
}
