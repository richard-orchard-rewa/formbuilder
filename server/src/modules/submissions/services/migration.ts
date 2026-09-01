import type { Field, FieldMapping, FieldType } from "shared"

const TEXT_LIKE: FieldType[] = ["text", "textarea"]
const CHOICE_LIKE: FieldType[] = ["dropdown", "radio"]

export interface CoercionResult {
  ok: boolean
  value?: unknown
}

// Converts one field's stored value from its source type to a target
// type, only where the conversion can't silently misrepresent the data
// (US-6.1). This app's builder never changes a field's type in place --
// changing type means deleting the old field and adding a new one -- so
// there's no way to know two differently-typed fields are "the same
// field" beyond an admin saying so via a FieldMapping; this function's
// job is just to decide whether *that specific value*, once mapped, can
// be trusted in its new shape. Anything not covered here (checkbox <->
// number, an unparseable number, a dropdown value the target's options
// don't contain, ...) is reported as not-ok so the caller preserves the
// original value as legacy data instead of guessing.
export function coerceValue(
  value: unknown,
  sourceField: Field,
  targetField: Field,
): CoercionResult {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value }
  }

  if (sourceField.type === targetField.type) {
    return { ok: true, value }
  }

  const source = sourceField.type
  const target = targetField.type

  if (TEXT_LIKE.includes(source) && TEXT_LIKE.includes(target)) {
    return { ok: true, value }
  }

  if (source === "number" && TEXT_LIKE.includes(target)) {
    return { ok: true, value: String(value) }
  }
  if (TEXT_LIKE.includes(source) && target === "number") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false }
  }

  if (source === "date" && TEXT_LIKE.includes(target)) {
    return { ok: true, value }
  }
  if (TEXT_LIKE.includes(source) && target === "date") {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? { ok: true, value }
      : { ok: false }
  }

  if (CHOICE_LIKE.includes(source) && TEXT_LIKE.includes(target)) {
    return { ok: true, value }
  }
  if (
    (TEXT_LIKE.includes(source) || CHOICE_LIKE.includes(source)) &&
    CHOICE_LIKE.includes(target) &&
    "options" in targetField
  ) {
    return targetField.options.some((option) => option.value === value)
      ? { ok: true, value }
      : { ok: false }
  }

  if (source === "checkbox" && TEXT_LIKE.includes(target)) {
    return { ok: true, value: value ? "Yes" : "No" }
  }

  return { ok: false }
}

export interface MigratedData {
  data: Record<string, unknown>
  legacyData: Record<string, unknown> | null
}

// Builds the data payload for moving a submission from `sourceFields`' shape
// to `targetFields`' (US-6.1). A field id present in both is always copied
// verbatim -- a stable id guarantees a stable type in this app, so there's
// no coercion risk. Every other source field needs an explicit
// `fieldMappings` decision; a value that's dropped, unmapped, or whose
// mapped coercion isn't safe is never discarded outright -- it's preserved
// under `legacyData`, keyed by its original field id, so an admin can still
// see and act on it later.
export function migrateData(
  sourceFields: Field[],
  targetFields: Field[],
  fieldMappings: FieldMapping[],
  rawData: Record<string, unknown>,
): MigratedData {
  const targetFieldsById = new Map(targetFields.map((field) => [field.id, field]))
  const mappingsBySourceId = new Map(
    fieldMappings.map((mapping) => [mapping.sourceFieldId, mapping]),
  )

  const data: Record<string, unknown> = {}
  const legacyData: Record<string, unknown> = {}

  for (const field of sourceFields) {
    const rawValue = rawData[field.id]
    if (rawValue === undefined) continue

    const identicalTarget = targetFieldsById.get(field.id)
    if (identicalTarget) {
      data[field.id] = rawValue
      continue
    }

    const mapping = mappingsBySourceId.get(field.id)
    if (!mapping || mapping.action === "drop") {
      legacyData[field.id] = {
        label: field.label,
        type: field.type,
        value: rawValue,
      }
      continue
    }

    const target = targetFieldsById.get(mapping.targetFieldId)
    const coerced = target ? coerceValue(rawValue, field, target) : { ok: false }

    if (target && coerced.ok) {
      data[mapping.targetFieldId] = coerced.value
    } else {
      legacyData[field.id] = {
        label: field.label,
        type: field.type,
        value: rawValue,
        attemptedTargetFieldId: mapping.targetFieldId,
      }
    }
  }

  return {
    data,
    legacyData: Object.keys(legacyData).length > 0 ? legacyData : null,
  }
}
