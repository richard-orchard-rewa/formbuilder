import { FIELD_TYPES, FIELD_TYPE_LABELS, type FieldType } from "shared"
import { FIELD_TYPE_DRAG_KEY } from "./dnd.js"

// The list of field types an admin can drag onto the canvas (US-2.1). Each
// type's own configuration options land with the field-types epic (US-3.x).
export function FieldPalette() {
  return (
    <aside className="field-palette">
      <h2>Field types</h2>
      <ul>
        {FIELD_TYPES.map((type) => (
          <PaletteItem key={type} type={type} />
        ))}
      </ul>
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
