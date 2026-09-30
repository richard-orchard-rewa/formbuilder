import { useRef, useState, type ReactNode } from "react"
import { FIELD_TYPE_LABELS, FieldTypeSchema, type Field, type FieldType } from "shared"
import {
  FIELD_BINDING_DRAG_KEY,
  FIELD_REORDER_DRAG_KEY,
  FIELD_TYPE_DRAG_KEY,
} from "./dnd.js"
import { FieldTypeIcon } from "./FieldPalette.js"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  LayersIcon,
  LinkIcon,
  LockIcon,
  TrashIcon,
} from "./icons.js"

interface FormCanvasProps {
  fields: Field[]
  selectedId: string | null
  onDrop: (type: FieldType, index: number) => void
  onReorder: (fieldId: string, index: number) => void
  onSelect: (id: string) => void
  // Adding a data-bound field from the palette's DBS section. Builders
  // that don't offer bound fields leave it unset, and such drops are ignored.
  onDropBinding?: (bindingKey: string, index: number) => void
  // The field card's own delete button; the builder decides whether to
  // confirm first.
  onDelete?: (fieldId: string) => void
  eyebrow?: string
  title?: string
  subtitle?: string
  // Rendered below the fields, e.g. a builder's sticky actions.
  footer?: ReactNode
}

// The drop target for the field palette (US-2.1) and for reordering fields
// already on the canvas (US-2.2). Tracks where in the field list the
// cursor currently sits so a field lands exactly at the drop position
// rather than always at the end. Clicking a field selects it for
// configuration in the inspector (US-3.1); each card also has move up/down
// and delete controls, as in the design prototype.
export function FormCanvas({
  fields,
  selectedId,
  onDrop,
  onReorder,
  onSelect,
  onDropBinding,
  onDelete,
  eyebrow = "FORM CANVAS",
  title = "Fields",
  subtitle,
  footer,
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
    return (
      event.dataTransfer.types.includes(FIELD_TYPE_DRAG_KEY) ||
      (onDropBinding !== undefined &&
        event.dataTransfer.types.includes(FIELD_BINDING_DRAG_KEY))
    )
  }

  function isReorderDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(FIELD_REORDER_DRAG_KEY)
  }

  // A move by one place, expressed as the drop index onReorder expects
  // (a position in the list *before* the move).
  function move(index: number, direction: -1 | 1) {
    onReorder(fields[index].id, direction === -1 ? index - 1 : index + 2)
  }

  return (
    <section
      className="form-canvas module-canvas"
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
        } else if (
          onDropBinding &&
          event.dataTransfer.types.includes(FIELD_BINDING_DRAG_KEY)
        ) {
          event.preventDefault()
          const key = event.dataTransfer.getData(FIELD_BINDING_DRAG_KEY)
          if (key) onDropBinding(key, index)
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
      <div className="canvas-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span>
          {fields.length} {fields.length === 1 ? "field" : "fields"}
        </span>
      </div>
      {fields.length === 0 && dropIndex === null && (
        <div className="empty-state form-canvas__empty">
          <LayersIcon />
          <h3>No fields added</h3>
          <p>
            Choose a data-bound or custom field from the library, or drag one
            here.
          </p>
        </div>
      )}
      <ol className="form-canvas__fields" ref={listRef}>
        {fields.map((field, index) => (
          <li key={field.id}>
            {dropIndex === index && <DropIndicator />}
            <article
              className={
                "field-card form-canvas__field" +
                (field.id === selectedId
                  ? " selected form-canvas__field--selected"
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
              <div
                className={
                  "field-kind " + (field.type === "bound" ? "bound" : "custom")
                }
              >
                <FieldTypeIcon type={field.type} />
              </div>
              <div className="field-card-main">
                <div>
                  <strong>{field.label}</strong>
                  <span>
                    {field.type === "bound"
                      ? "Data bound"
                      : FIELD_TYPE_LABELS[field.type]}
                  </span>
                  {field.required && (
                    <span className="form-canvas__field-required-badge">
                      Required
                    </span>
                  )}
                </div>
                {field.type === "bound" && (
                  <>
                    <code>{field.binding.key}</code>
                    {field.binding.access === "read" && (
                      <small>
                        <LockIcon />
                        Read-only — shows the record's value
                      </small>
                    )}
                    {field.binding.access === "readWrite" && (
                      <small>
                        <LinkIcon />
                        Saved back to the record
                      </small>
                    )}
                  </>
                )}
                {(field.type === "dropdown" || field.type === "radio") && (
                  <small className="field-card-options">
                    {field.options.length}{" "}
                    {field.options.length === 1 ? "option" : "options"}
                  </small>
                )}
              </div>
              <div className="field-actions">
                <button
                  type="button"
                  aria-label={`Move ${field.label} up`}
                  disabled={index === 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    move(index, -1)
                  }}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${field.label} down`}
                  disabled={index === fields.length - 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    move(index, 1)
                  }}
                >
                  <ArrowDownIcon />
                </button>
                {onDelete && (
                  <button
                    type="button"
                    aria-label={`Delete ${field.label}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete(field.id)
                    }}
                  >
                    <TrashIcon />
                  </button>
                )}
                <ChevronRightIcon />
              </div>
            </article>
          </li>
        ))}
        {dropIndex === fields.length && (
          <li>
            <DropIndicator />
          </li>
        )}
      </ol>
      {footer}
    </section>
  )
}

function DropIndicator() {
  return <div className="form-canvas__drop-indicator" />
}
