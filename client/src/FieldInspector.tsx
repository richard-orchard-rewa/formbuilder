import type { Field, FieldOption, RadioField } from "shared"

interface FieldInspectorProps {
  field: Field | null
  onChange: (field: Field) => void
}

// Configuration panel for the field selected on the canvas. Each type's
// own options (US-3.1, US-3.4) grow independently here as their
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
          <RequiredCheckbox field={field} onChange={onChange} />
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

      {field.type === "checkbox" && (
        <>
          <RequiredCheckbox field={field} onChange={onChange} />
          <label className="field-inspector__field field-inspector__field--checkbox">
            <input
              type="checkbox"
              checked={field.defaultChecked}
              onChange={(event) =>
                onChange({ ...field, defaultChecked: event.target.checked })
              }
            />
            Checked by default
          </label>
        </>
      )}

      {field.type === "radio" && (
        <>
          <RequiredCheckbox field={field} onChange={onChange} />
          <OptionsEditor field={field} onChange={onChange} />
        </>
      )}

      {field.type === "date" && (
        <>
          <RequiredCheckbox field={field} onChange={onChange} />
          <label className="field-inspector__field">
            Earliest date
            <input
              type="date"
              value={field.min ?? ""}
              onChange={(event) =>
                onChange({ ...field, min: event.target.value || undefined })
              }
            />
          </label>
          <label className="field-inspector__field">
            Latest date
            <input
              type="date"
              value={field.max ?? ""}
              onChange={(event) =>
                onChange({ ...field, max: event.target.value || undefined })
              }
            />
          </label>
        </>
      )}

      {field.type === "number" && (
        <>
          <RequiredCheckbox field={field} onChange={onChange} />
          <label className="field-inspector__field">
            Minimum
            <input
              type="number"
              value={field.min ?? ""}
              onChange={(event) => {
                const value = event.target.valueAsNumber
                onChange({
                  ...field,
                  min: Number.isNaN(value) ? undefined : value,
                })
              }}
            />
          </label>
          <label className="field-inspector__field">
            Maximum
            <input
              type="number"
              value={field.max ?? ""}
              onChange={(event) => {
                const value = event.target.valueAsNumber
                onChange({
                  ...field,
                  max: Number.isNaN(value) ? undefined : value,
                })
              }}
            />
          </label>
          <label className="field-inspector__field">
            Step
            <input
              type="number"
              min={0}
              value={field.step ?? ""}
              onChange={(event) => {
                const value = event.target.valueAsNumber
                onChange({
                  ...field,
                  step: Number.isNaN(value) ? undefined : value,
                })
              }}
            />
          </label>
        </>
      )}
    </aside>
  )
}

// Any field type with a `required` flag can render this the same way.
function RequiredCheckbox({
  field,
  onChange,
}: {
  field: Extract<Field, { required: boolean }>
  onChange: (field: Field) => void
}) {
  return (
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
  )
}

// Add/edit/reorder/delete the option list for a "radio" field.
function OptionsEditor({
  field,
  onChange,
}: {
  field: RadioField
  onChange: (field: Field) => void
}) {
  function replaceOption(index: number, next: FieldOption) {
    onChange({
      ...field,
      options: field.options.map((option, i) => (i === index ? next : option)),
    })
  }

  function moveOption(from: number, to: number) {
    const next = [...field.options]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange({ ...field, options: next })
  }

  function removeOption(index: number) {
    const removed = field.options[index]
    const options = field.options.filter((_, i) => i !== index)
    const defaultValue =
      field.defaultValue === removed.value ? undefined : field.defaultValue
    onChange({ ...field, options, defaultValue })
  }

  return (
    <>
      <div className="field-inspector__field">
        Options
        <ul className="field-inspector__options">
          {field.options.map((option, index) => (
            <li key={index} className="field-inspector__option">
              <input
                type="text"
                placeholder="Label"
                value={option.label}
                onChange={(event) =>
                  replaceOption(index, { ...option, label: event.target.value })
                }
              />
              <input
                type="text"
                placeholder="Value"
                value={option.value}
                onChange={(event) =>
                  replaceOption(index, { ...option, value: event.target.value })
                }
              />
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveOption(index, index - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === field.options.length - 1}
                onClick={() => moveOption(index, index + 1)}
              >
                ↓
              </button>
              <button type="button" onClick={() => removeOption(index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...field,
              options: [...field.options, { value: "", label: "" }],
            })
          }
        >
          Add option
        </button>
      </div>

      <label className="field-inspector__field">
        Default selection
        <select
          value={field.defaultValue ?? ""}
          onChange={(event) =>
            onChange({
              ...field,
              defaultValue: event.target.value || undefined,
            })
          }
        >
          <option value="">None</option>
          {field.options.map((option, index) => (
            <option key={index} value={option.value}>
              {option.label || option.value}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
