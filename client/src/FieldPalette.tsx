import { useState } from "react"
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type BindingAnchor,
  type BindingDescriptor,
  type FieldType,
} from "shared"
import { FIELD_BINDING_DRAG_KEY, FIELD_TYPE_DRAG_KEY } from "./dnd.js"
import {
  AlignLeftIcon,
  CalendarIcon,
  CheckIcon,
  CheckSquareIcon,
  CircleDotIcon,
  DatabaseIcon,
  HashIcon,
  ListIcon,
  PlusIcon,
  TypeIcon,
} from "./icons.js"
import { SearchInput } from "./ui.js"

// What the palette knows about the Data Binding Service's dictionary.
// Omitted entirely by builders that don't offer data-bound fields.
export type PaletteBindings =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; bindings: BindingDescriptor[] }

interface FieldPaletteProps {
  bindings?: PaletteBindings
  // Clicking an item adds it at the end of the canvas; dragging it onto
  // the canvas places it exactly.
  onAddType?: (type: FieldType) => void
  onAddBinding?: (key: string) => void
  // Bindings already on the canvas -- each can be added once.
  usedBindingKeys?: ReadonlySet<string>
}

// Case bindings aren't offered: form-builder has no case-scoped modules yet
// (only the practitioner portal demo uses them).
const ANCHOR_ORDER: BindingAnchor[] = ["session", "participant", "client"]

const ANCHOR_LABELS: Record<BindingAnchor, string> = {
  case: "Case",
  session: "Session",
  participant: "Participant",
  client: "Client",
}

const TYPE_ICONS: Record<FieldType, typeof TypeIcon> = {
  text: TypeIcon,
  textarea: AlignLeftIcon,
  dropdown: ListIcon,
  checkbox: CheckSquareIcon,
  radio: CircleDotIcon,
  date: CalendarIcon,
  number: HashIcon,
}

export function FieldTypeIcon({ type }: { type: FieldType | "bound" }) {
  const Icon = type === "bound" ? DatabaseIcon : TYPE_ICONS[type]
  return <Icon />
}

type Tab = "bound" | "custom"

// The field library an admin adds fields from (US-2.1): custom field types,
// and -- for builders that offer them -- the fields the Data Binding
// Service says can be bound to a record (docs/proposals/databound-fields.md),
// listing whatever the DBS's dictionary describes rather than a fixed set.
// Split into the design prototype's "Data bound" / "Custom" tabs.
export function FieldPalette({
  bindings,
  onAddType,
  onAddBinding,
  usedBindingKeys,
}: FieldPaletteProps) {
  const [tab, setTab] = useState<Tab>(bindings ? "bound" : "custom")
  const [search, setSearch] = useState("")

  return (
    <aside className="field-palette field-library">
      <div>
        <p className="eyebrow">FIELD LIBRARY</p>
        <h2>Add fields</h2>
      </div>
      {bindings && (
        <div className="field-tabs" role="tablist" aria-label="Field kinds">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "bound"}
            className={tab === "bound" ? "active" : undefined}
            onClick={() => setTab("bound")}
          >
            Data bound
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "custom"}
            className={tab === "custom" ? "active" : undefined}
            onClick={() => setTab("custom")}
          >
            Custom
          </button>
        </div>
      )}

      {tab === "custom" && (
        <>
          <p className="library-help">
            Click a field type to add it, or drag it into place on the canvas.
          </p>
          <ul className="field-library-list custom-types">
            {FIELD_TYPES.map((type) => (
              <PaletteItem key={type} type={type} onAdd={onAddType} />
            ))}
          </ul>
        </>
      )}

      {tab === "bound" && bindings && (
        <>
          <SearchInput
            className="compact-search"
            label="Search data-bound fields"
            value={search}
            onChange={setSearch}
            placeholder="Search existing fields"
          />
          <p className="library-help">
            Dictionary fields keep a stable key and read or write their record
            only through the Data Binding Service.
          </p>
          {bindings.status === "loading" && (
            <p className="field-palette__note">Loading…</p>
          )}
          {bindings.status === "unavailable" && (
            <p className="field-palette__note" role="status">
              The Data Binding Service isn't available.
            </p>
          )}
          {bindings.status === "ready" && (
            <BindingGroups
              bindings={bindings.bindings.filter((b) =>
                `${b.label} ${b.key}`
                  .toLowerCase()
                  .includes(search.trim().toLowerCase()),
              )}
              onAdd={onAddBinding}
              usedKeys={usedBindingKeys}
            />
          )}
        </>
      )}
    </aside>
  )
}

function BindingGroups({
  bindings,
  onAdd,
  usedKeys,
}: {
  bindings: BindingDescriptor[]
  onAdd?: (key: string) => void
  usedKeys?: ReadonlySet<string>
}) {
  if (bindings.length === 0) {
    return <p className="field-palette__note">No matching fields.</p>
  }
  return (
    <>
      {ANCHOR_ORDER.filter((anchor) =>
        bindings.some((b) => b.anchor === anchor),
      ).map((anchor) => (
        <section key={anchor} className="field-library-group">
          <h3>{ANCHOR_LABELS[anchor]}</h3>
          <ul className="field-library-list">
            {bindings
              .filter((b) => b.anchor === anchor)
              .map((binding) => (
                <BindingItem
                  key={binding.key}
                  binding={binding}
                  onAdd={onAdd}
                  used={usedKeys?.has(binding.key) ?? false}
                />
              ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function PaletteItem({
  type,
  onAdd,
}: {
  type: FieldType
  onAdd?: (type: FieldType) => void
}) {
  return (
    <li
      className="field-palette__item"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(FIELD_TYPE_DRAG_KEY, type)
        event.dataTransfer.effectAllowed = "copy"
      }}
    >
      <button
        type="button"
        aria-label={`Add ${FIELD_TYPE_LABELS[type]} field`}
        disabled={!onAdd}
        onClick={() => onAdd?.(type)}
      >
        <FieldTypeIcon type={type} />
        <span>
          <strong>{FIELD_TYPE_LABELS[type]}</strong>
        </span>
        <PlusIcon />
      </button>
    </li>
  )
}

function BindingItem({
  binding,
  onAdd,
  used,
}: {
  binding: BindingDescriptor
  onAdd?: (key: string) => void
  used: boolean
}) {
  return (
    <li
      className="field-palette__item field-palette__item--bound"
      draggable={!used}
      title={binding.description}
      onDragStart={(event) => {
        event.dataTransfer.setData(FIELD_BINDING_DRAG_KEY, binding.key)
        event.dataTransfer.effectAllowed = "copy"
      }}
    >
      <button
        type="button"
        aria-label={
          used ? `${binding.label} (already added)` : `Add ${binding.label}`
        }
        disabled={used || !onAdd}
        onClick={() => onAdd?.(binding.key)}
      >
        <DatabaseIcon />
        <span>
          <strong>{binding.label}</strong>
          <small>{binding.key}</small>
          {binding.access === "read" && (
            <span className="field-palette__badge">Read-only</span>
          )}
        </span>
        {used ? <CheckIcon /> : <PlusIcon />}
      </button>
    </li>
  )
}
