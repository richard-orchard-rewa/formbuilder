import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type BindingDescriptor,
  type FieldType,
} from "shared"
import { FIELD_BINDING_DRAG_KEY, FIELD_TYPE_DRAG_KEY } from "./dnd.js"

// What the palette knows about the Data Binding Service's dictionary.
// Omitted entirely by builders that don't offer data-bound fields.
export type PaletteBindings =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; bindings: BindingDescriptor[] }

interface FieldPaletteProps {
  bindings?: PaletteBindings
}

// The list of field types an admin can drag onto the canvas (US-2.1). Each
// type's own configuration options land with the field-types epic (US-3.x).
// Below them, the fields the Data Binding Service says can be bound to a
// record (docs/proposals/databound-fields.md) -- the palette lists whatever
// the DBS's dictionary describes rather than a fixed set.
export function FieldPalette({ bindings }: FieldPaletteProps) {
  return (
    <aside className="field-palette">
      <h2>Field types</h2>
      <ul>
        {FIELD_TYPES.map((type) => (
          <PaletteItem key={type} type={type} />
        ))}
      </ul>
      {bindings && (
        <>
          <h2>Data bound · Client</h2>
          {bindings.status === "loading" && (
            <p className="field-palette__note">Loading…</p>
          )}
          {bindings.status === "unavailable" && (
            <p className="field-palette__note" role="status">
              The Data Binding Service isn't available.
            </p>
          )}
          {bindings.status === "ready" && (
            <ul>
              {bindings.bindings.map((binding) => (
                <BindingItem key={binding.key} binding={binding} />
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  )
}

function PaletteItem({ type }: { type: FieldType }) {
  return (
    <li
      className="field-palette__item"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(FIELD_TYPE_DRAG_KEY, type)
        event.dataTransfer.effectAllowed = "copy"
      }}
    >
      {FIELD_TYPE_LABELS[type]}
    </li>
  )
}

function BindingItem({ binding }: { binding: BindingDescriptor }) {
  return (
    <li
      className="field-palette__item field-palette__item--bound"
      draggable
      title={binding.description}
      onDragStart={(event) => {
        event.dataTransfer.setData(FIELD_BINDING_DRAG_KEY, binding.key)
        event.dataTransfer.effectAllowed = "copy"
      }}
    >
      {binding.label}
      {binding.access === "read" && (
        <span className="field-palette__badge">Read-only</span>
      )}
    </li>
  )
}
