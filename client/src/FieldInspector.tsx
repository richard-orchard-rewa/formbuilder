import type { DropdownOption, Field } from "shared"

interface FieldInspectorProps {
  field: Field | null
  onChange: (field: Field) => void
}

// Configuration panel for the field selected on the canvas. "text" and
// "dropdown" have type-specific options so far (US-3.1, US-3.3); other
// types grow their own as their field-types epic issues land.
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

      {field.type === "dropdown" && (
        <>
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

          <div className="field-inspector__field">
            Options
            <ul className="field-inspector__options">
              {field.options.map((option, index) => (
                <li key={index} className="field-inspector__option">
                  <input
                    type="text"
                    placeholder="Label"
                    value={option.label}
                    onChange={(event) => {
                      const options = replaceOption(field.options, index, {
                        ...option,
                        label: event.target.value,
                      })
                      onChange({ ...field, options })
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={option.value}
                    onChange={(event) => {
                      const options = replaceOption(field.options, index, {
                        ...option,
                        value: event.target.value,
                      })
                      onChange({ ...field, options })
                    }}
                  />
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() =>
                      onChange({
                        ...field,
                        options: moveOption(field.options, index, index - 1),
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === field.options.length - 1}
                    onClick={() =>
                      onChange({
                        ...field,
                        options: moveOption(field.options, index, index + 1),
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const options = field.options.filter(
                        (_, i) => i !== index,
                      )
                      const defaultValue =
                        field.defaultValue === option.value
                          ? undefined
                          : field.defaultValue
                      onChange({ ...field, options, defaultValue })
                    }}
                  >
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
      )}
    </aside>
  )
}

function replaceOption(
  options: DropdownOption[],
  index: number,
  next: DropdownOption,
): DropdownOption[] {
  return options.map((option, i) => (i === index ? next : option))
}

function moveOption(
  options: DropdownOption[],
  from: number,
  to: number,
): DropdownOption[] {
  const next = [...options]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
