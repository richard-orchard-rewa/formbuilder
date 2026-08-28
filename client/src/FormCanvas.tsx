import { useRef, useState } from "react"
import { FIELD_TYPE_LABELS, FieldTypeSchema, type Field, type FieldType } from "shared"
import { FIELD_TYPE_DRAG_KEY } from "./dnd.js"

interface FormCanvasProps {
  fields: Field[]
  onDrop: (type: FieldType, index: number) => void
}

// The drop target for the field palette (US-2.1). Tracks where in the
// field list the cursor currently sits so a field lands exactly at the
// drop position rather than always at the end.
export function FormCanvas({ fields, onDrop }: FormCanvasProps) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)
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

  function isFieldDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(FIELD_TYPE_DRAG_KEY)
  }

  return (
    <section
      className="form-canvas"
      onDragOver={(event) => {
        if (!isFieldDrag(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
        setDropIndex(indexForPointer(event.clientY))
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setDropIndex(null)
      }}
      onDrop={(event) => {
        if (!isFieldDrag(event)) return
        event.preventDefault()
        const parsed = FieldTypeSchema.safeParse(
          event.dataTransfer.getData(FIELD_TYPE_DRAG_KEY),
        )
        if (parsed.success) {
          // Computed fresh rather than read from `dropIndex` state: the
          // last dragover's setDropIndex may not have flushed yet by the
          // time drop fires, so the state can still be stale here.
          onDrop(parsed.data, indexForPointer(event.clientY))
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
            <div className="form-canvas__field" data-field-item>
              <span className="form-canvas__field-type">
                {FIELD_TYPE_LABELS[field.type]}
              </span>
              <span className="form-canvas__field-label">{field.label}</span>
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
