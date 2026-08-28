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

// US-3.1: a single-line text field, configurable beyond just its label.
export const TextFieldSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  label: z.string(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  maxLength: z.number().int().positive().optional(),
})

export type TextField = z.infer<typeof TextFieldSchema>

// Not yet configurable beyond a label — their own field-types epic issues
// (US-3.2, US-3.3) extend these.
export const TextAreaFieldSchema = z.object({
  id: z.string(),
  type: z.literal("textarea"),
  label: z.string(),
})

export const DropdownFieldSchema = z.object({
  id: z.string(),
  type: z.literal("dropdown"),
  label: z.string(),
})

export const FieldSchema = z.discriminatedUnion("type", [
  TextFieldSchema,
  TextAreaFieldSchema,
  DropdownFieldSchema,
])

export type Field = z.infer<typeof FieldSchema>
