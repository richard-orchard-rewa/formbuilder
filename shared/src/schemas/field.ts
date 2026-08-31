import { z } from "zod"

// Per-type configuration lands as each field-types epic issue is built.
// This is a discriminated union (per US-3.4's "extensible type registry")
// so a new type/config can be added without touching the others.
export const FieldTypeSchema = z.enum(["text", "textarea", "dropdown"])

export type FieldType = z.infer<typeof FieldTypeSchema>

export const FIELD_TYPES: readonly FieldType[] = [
  "text",
  "textarea",
  "dropdown",
]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  textarea: "Text area",
  dropdown: "Dropdown",
}

// Any field type can be marked required (US-3.5); per-type configuration
// beyond that (max length, options list, ...) lands with their own issues.
const requiredFlag = z.boolean().default(false)

// US-3.1: a single-line text field, configurable beyond just its label.
export const TextFieldSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  label: z.string(),
  placeholder: z.string().optional(),
  required: requiredFlag,
  maxLength: z.number().int().positive().optional(),
})

export type TextField = z.infer<typeof TextFieldSchema>

// Not yet configurable beyond a label and required — their own field-types
// epic issues (US-3.2, US-3.3) extend these.
export const TextAreaFieldSchema = z.object({
  id: z.string(),
  type: z.literal("textarea"),
  label: z.string(),
  required: requiredFlag,
})

// US-3.3: a dropdown field with an admin-defined list of options.
export const DropdownOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})

export type DropdownOption = z.infer<typeof DropdownOptionSchema>

export const DropdownFieldSchema = z.object({
  id: z.string(),
  type: z.literal("dropdown"),
  label: z.string(),
  required: requiredFlag,
  options: z.array(DropdownOptionSchema).default([]),
  // Must match one of `options`' values, enforced where options are edited
  // rather than in this shape (a value can be added and made default in
  // the same edit).
  defaultValue: z.string().optional(),
})

export const FieldSchema = z.discriminatedUnion("type", [
  TextFieldSchema,
  TextAreaFieldSchema,
  DropdownFieldSchema,
])

export type Field = z.infer<typeof FieldSchema>
