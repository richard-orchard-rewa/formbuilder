import { useRef, useState } from "react"
import { FIELD_TYPE_LABELS, FieldTypeSchema, type Field, type FieldType } from "shared"
import { FIELD_REORDER_DRAG_KEY, FIELD_TYPE_DRAG_KEY } from "./dnd.js"

interface FormCanvasProps {
  fields: Field[]
  selectedId: string | null
  onDrop: (type: FieldType, index: number) => void
  onReorder: (fieldId: string, index: number) => void
  onSelect: (id: string) => void
}

// The drop target for the field palette (US-2.1) and for reordering fields
// already on the canvas (US-2.2). Tracks where in the field list the
// cursor currently sits so a field lands exactly at the drop position
// rather than always at the end. Clicking a field selects it for
// configuration in the inspector (US-3.1).
export function FormCanvas({
  fields,
  selectedId,
  onDrop,
  onReorder,
  onSelect,
}: FormCanvasProps) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  function indexForPointer(clientY: number): number {
    const items = listRef.current?.querySelectorAll<HTMLElement>(
      "[data-field-item]",
    )
    if (!items) return fields.length

    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        return i
      }
    }
    return fields.length
  }

  function isNewFieldDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(FIELD_TYPE_DRAG_KEY)
  }

  function isReorderDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(FIELD_REORDER_DRAG_KEY)
  }

  return (
    <section
      className="form-canvas"
      onDragOver={(event) => {
        if (!isNewFieldDrag(event) && !isReorderDrag(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = isReorderDrag(event) ? "move" : "copy"
        setDropIndex(indexForPointer(event.clientY))
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setDropIndex(null)
      }}
      onDrop={(event) => {
        // Computed fresh rather than read from `dropIndex` state: the last
        // dragover's setDropIndex may not have flushed yet by the time drop
        // fires, so the state can still be stale here.
        const index = indexForPointer(event.clientY)

        if (isReorderDrag(event)) {
          event.preventDefault()
          const fieldId = event.dataTransfer.getData(FIELD_REORDER_DRAG_KEY)
          if (fieldId) onReorder(fieldId, index)
        } else if (isNewFieldDrag(event)) {
          event.preventDefault()
          const parsed = FieldTypeSchema.safeParse(
            event.dataTransfer.getData(FIELD_TYPE_DRAG_KEY),
          )
          if (parsed.success) onDrop(parsed.data, index)
        }
        setDropIndex(null)
      }}
    >
      <h2>Form canvas</h2>
      {fields.length === 0 && dropIndex === null && (
        <p className="form-canvas__empty">
          Drag a field type here to add it to the form.
        </p>
      )}
      <ol className="form-canvas__fields" ref={listRef}>
        {fields.map((field, index) => (
          <li key={field.id}>
            {dropIndex === index && <DropIndicator />}
            <div
              className={
                "form-canvas__field" +
                (field.id === selectedId
                  ? " form-canvas__field--selected"
                  : "")
              }
              data-field-item
              draggable
              style={{ opacity: draggingId === field.id ? 0.4 : 1 }}
              onDragStart={(event) => {
                event.dataTransfer.setData(FIELD_REORDER_DRAG_KEY, field.id)
                event.dataTransfer.effectAllowed = "move"
                setDraggingId(field.id)
              }}
              onDragEnd={() => setDraggingId(null)}
              onClick={() => onSelect(field.id)}
            >
              <span className="form-canvas__field-type">
                {FIELD_TYPE_LABELS[field.type]}
              </span>
              <span className="form-canvas__field-label">{field.label}</span>
              {field.required && (
                <span className="form-canvas__field-required-badge">
                  Required
                </span>
              )}
            </div>
          </li>
        ))}
        {dropIndex === fields.length && (
          <li>
            <DropIndicator />
          </li>
        )}
      </ol>
    </section>
  )
}

function DropIndicator() {
  return <div className="form-canvas__drop-indicator" />
}
