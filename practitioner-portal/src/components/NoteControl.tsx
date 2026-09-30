import { useId } from "react"
import type { NoteFieldDef, NoteValue } from "../seed/types"

// A field captured in the session note itself -- never sent to ICIS.
export function NoteControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: NoteFieldDef
  value: NoteValue | undefined
  onChange: (value: NoteValue) => void
  disabled?: boolean
}) {
  const id = useId()
  const label = (
    <label className="field-label" htmlFor={id}>
      {field.label}
      {"required" in field && field.required && <span className="required">Required</span>}
    </label>
  )

  switch (field.kind) {
    case "text":
      return (
        <div className="field">
          {label}
          <input id={id} type="text" value={String(value ?? "")} placeholder={field.placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
    case "textarea":
      return (
        <div className="field wide">
          {label}
          <textarea id={id} value={String(value ?? "")} placeholder={field.placeholder ?? "Add relevant observations, assessment and clinical context…"} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
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
              <label key={o} className={value === o ? "choice selected" : "choice"}>
                <input type="radio" name={id} checked={value === o} disabled={disabled} onChange={() => onChange(o)} />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      )
    case "checkboxes": {
      const selected = Array.isArray(value) ? value : []
      return (
        <fieldset className="field wide">
          <legend className="field-label">{field.label}</legend>
          <div className="check-grid">
            {field.options.map((o) => (
              <label key={o} className={selected.includes(o) ? "choice selected" : "choice"}>
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  disabled={disabled}
                  onChange={(e) => onChange(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))}
                />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      )
    }
    case "scale": {
      const ratings = value && typeof value === "object" && !Array.isArray(value) ? value : {}
      return (
        <fieldset className="field wide">
          <legend className="field-label">{field.label}</legend>
          <div className="score-matrix">
            <div className="score-row score-head">
              <span>Domain</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <b key={n}>{n}</b>
              ))}
            </div>
            {field.items.map((item) => (
              <div className="score-row" key={item}>
                <strong>{item}</strong>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} aria-label={`${item}: ${n}`}>
                    <input
                      type="radio"
                      name={`${id}-${item}`}
                      checked={ratings[item] === n}
                      disabled={disabled}
                      onChange={() => onChange({ ...ratings, [item]: n })}
                    />
                    <span />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
      )
    }
  }
}
