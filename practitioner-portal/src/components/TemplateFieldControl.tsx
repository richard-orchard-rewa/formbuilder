import { useId } from "react"
import type { Field } from "shared"
import { BoundControl } from "./BoundControl"

// One field of a form-builder session template. Bound fields carry a
// snapshot of their binding, so they render as they were published even if
// the Data Binding Service has since changed it.
export function TemplateFieldControl({
  field,
  value,
  onChange,
  disabled,
  hint,
}: {
  field: Field
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
  hint?: React.ReactNode
}) {
  const id = useId()

  if (field.type === "bound") {
    return (
      <BoundControl
        field={{ kind: "bound", id: field.id, binding: field.binding.key, label: field.label, presentation: field.presentation }}
        descriptor={field.binding}
        value={typeof value === "string" ? value : null}
        onChange={onChange}
        disabled={disabled}
        hint={hint}
      />
    )
  }

  const label = (
    <label className="field-label" htmlFor={id}>
      {field.label}
      {field.required && <span className="required">Required</span>}
    </label>
  )

  switch (field.type) {
    case "text":
      return (
        <div className="field">
          {label}
          <input
            id={id}
            type="text"
            value={String(value ?? "")}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
    case "textarea":
      return (
        <div className="field wide">
          {label}
          <textarea
            id={id}
            value={String(value ?? "")}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            rows={field.rows}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
    case "number":
      return (
        <div className="field">
          {label}
          <input
            id={id}
            type="number"
            value={typeof value === "number" ? value : ""}
            min={field.min}
            max={field.max}
            step={field.step}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </div>
      )
    case "date":
      return (
        <div className="field">
          {label}
          <input
            id={id}
            type="date"
            value={String(value ?? "")}
            min={field.min}
            max={field.max}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        </div>
      )
    case "dropdown":
      return (
        <div className="field">
          {label}
          <select id={id} value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">—</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )
    case "radio":
      return (
        <fieldset className="field wide">
          <legend className="field-label">
            {field.label}
            {field.required && <span className="required">Required</span>}
          </legend>
          <div className="choice-row">
            {field.options.map((o) => (
              <label key={o.value} className={value === o.value ? "choice selected" : "choice"}>
                <input type="radio" name={id} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )
    case "checkbox":
      return (
        <div className="field wide">
          <label className={value === true ? "choice selected" : "choice"}>
            <input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            {field.label}
            {field.required && <span className="required">Required</span>}
          </label>
        </div>
      )
  }
}
