import { useEffect, useId, useState } from "react"
import type { BindingDescriptor, BindingOptions, BindingPresentation } from "shared"
import { optionsFor } from "../dbs"
import type { BoundFieldDef } from "../seed/types"
import { Icon } from "./Icon"

export function useOptions(descriptor: BindingDescriptor | undefined) {
  const [options, setOptions] = useState<BindingOptions | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!descriptor || descriptor.control.kind !== "lookup") return
    let live = true
    optionsFor(descriptor).then(
      (o) => live && setOptions(o),
      (e: Error) => live && setError(e.message),
    )
    return () => {
      live = false
    }
  }, [descriptor])
  return { options, error }
}

// A value's label: a lookup's option label, or the text itself.
export function useDisplayValue(descriptor: BindingDescriptor | undefined, value: string | null) {
  const { options } = useOptions(descriptor)
  if (value === null || value === "") return null
  if (descriptor?.control.kind !== "lookup") return value
  return options?.options.find((o) => o.value === value)?.label ?? value
}

function presentationOf(field: BoundFieldDef, descriptor: BindingDescriptor): BindingPresentation {
  const allowed = descriptor.presentations?.allowed ?? ["dropdown"]
  if (field.presentation && allowed.includes(field.presentation)) return field.presentation
  return descriptor.presentations?.default ?? allowed[0]
}

// The binding's key, anchor and strategy -- shown on every bound field
// when the developer panel's "Show binding keys" is on.
function BindingChip({ descriptor }: { descriptor: BindingDescriptor }) {
  return (
    <span className="binding-chip" title={descriptor.description}>
      <code>{descriptor.key}</code>
      <span>v{descriptor.version}</span>
      <span>{descriptor.operations?.commit.strategy ?? descriptor.control.kind}</span>
      <span>{descriptor.access === "read" ? "read" : "read/write"}</span>
    </span>
  )
}

// A field whose value lives in ICIS. Everything about the control comes
// from the binding's descriptor: its type and length, where its options
// come from, whether it may be edited. The module only chose a label and
// how a list is shown.
export function BoundControl({
  field,
  descriptor,
  value,
  onChange,
  disabled,
  hint,
}: {
  field: BoundFieldDef
  descriptor: BindingDescriptor | undefined
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  hint?: React.ReactNode
}) {
  const id = useId()
  const { options, error } = useOptions(descriptor)
  const display = useDisplayValue(descriptor, value)

  if (!descriptor) {
    return (
      <div className="field bound missing">
        <span className="field-label">{field.label ?? field.binding}</span>
        <div className="missing-note">
          <Icon name="alert" size={16} />
          <span>
            <code>{field.binding}</code> isn't a published binding in the Data Binding Service, so this field
            can't be shown. A data steward creates it on the <strong>Data bindings</strong> page (or run{" "}
            <code>npm run demo:seed</code>).
          </span>
        </div>
      </div>
    )
  }

  const label = field.label ?? descriptor.label
  const readOnly = descriptor.access === "read"
  const required = descriptor.validation?.required ?? false
  const header = (
    <div className="field-head">
      <label className="field-label" id={`${id}-label`} htmlFor={id}>
        {label}
        {required && <span className="required">Required</span>}
      </label>
      <span className={readOnly ? "icis-badge read" : "icis-badge"} title={`Data-bound: ${descriptor.key}`}>
        <Icon name={readOnly ? "lock" : "link"} size={12} />
        {readOnly ? "From ICIS · display only" : "ICIS"}
      </span>
      <BindingChip descriptor={descriptor} />
    </div>
  )

  let control: React.ReactNode
  if (readOnly) {
    control = (
      <div id={id} className="locked-value">
        {display ?? <span className="empty">No value in ICIS</span>}
      </div>
    )
  } else if (descriptor.control.kind === "text") {
    control = (
      <input
        id={id}
        type="text"
        value={value ?? ""}
        maxLength={descriptor.control.maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  } else if (error || options?.source === "unavailable") {
    control = <div className="missing-note">The list of options couldn't be loaded{error ? `: ${error}` : ""}.</div>
  } else if (!options) {
    control = <div className="loading-line">Loading options…</div>
  } else if (presentationOf(field, descriptor) === "radio") {
    control = (
      <div className="choice-row" role="radiogroup" aria-labelledby={`${id}-label`}>
        {options.options.map((o) => (
          <label key={o.value} className={value === o.value ? "choice selected" : "choice"}>
            <input
              type="radio"
              name={id}
              checked={value === o.value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    )
  } else {
    control = (
      <select id={id} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
        {(descriptor.options?.allowBlank ?? true) && <option value="">—</option>}
        {options.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div className={readOnly ? "field bound readonly" : "field bound"}>
      {header}
      {control}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}
