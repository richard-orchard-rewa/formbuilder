import { z } from "zod"

// Per-type configuration lands as each field-types epic issue is built.
// This is a discriminated union (per US-3.4's "extensible type registry")
// so a new type/config can be added without touching the others.
export const FieldTypeSchema = z.enum([
  "text",
  "textarea",
  "dropdown",
  "checkbox",
  "radio",
  "date",
  "number",
])

export type FieldType = z.infer<typeof FieldTypeSchema>

export const FIELD_TYPES: readonly FieldType[] = [
  "text",
  "textarea",
  "dropdown",
  "checkbox",
  "radio",
  "date",
  "number",
]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  textarea: "Text area",
  dropdown: "Dropdown",
  checkbox: "Checkbox",
  radio: "Radio group",
  date: "Date",
  number: "Number",
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

// Not yet configurable beyond a label and required — its own field-types
// epic issue (US-3.2) extends this.
export const TextAreaFieldSchema = z.object({
  id: z.string(),
  type: z.literal("textarea"),
  label: z.string(),
  required: requiredFlag,
})

// A labeled list of selectable values, shared by "dropdown" and "radio".
export const FieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})

export type FieldOption = z.infer<typeof FieldOptionSchema>

// Not yet configurable beyond a label — its own field-types epic issue
// (US-3.3) extends this.
export const DropdownFieldSchema = z.object({
  id: z.string(),
  type: z.literal("dropdown"),
  label: z.string(),
  required: requiredFlag,
})

// US-3.4: a single checkbox, e.g. "I agree to the terms".
export const CheckboxFieldSchema = z.object({
  id: z.string(),
  type: z.literal("checkbox"),
  label: z.string(),
  required: z.boolean().default(false),
  defaultChecked: z.boolean().default(false),
})

export type CheckboxField = z.infer<typeof CheckboxFieldSchema>

// US-3.4: a mutually-exclusive group of options, all visible at once
// (unlike "dropdown", which hides them behind a closed control).
export const RadioFieldSchema = z.object({
  id: z.string(),
  type: z.literal("radio"),
  label: z.string(),
  required: z.boolean().default(false),
  options: z.array(FieldOptionSchema).default([]),
  defaultValue: z.string().optional(),
})

export type RadioField = z.infer<typeof RadioFieldSchema>

// US-3.4: a calendar date, optionally bounded to a range.
export const DateFieldSchema = z.object({
  id: z.string(),
  type: z.literal("date"),
  label: z.string(),
  required: z.boolean().default(false),
  min: z.string().optional(),
  max: z.string().optional(),
})

export type DateField = z.infer<typeof DateFieldSchema>

// US-3.4: a numeric value, optionally bounded and steppable.
export const NumberFieldSchema = z.object({
  id: z.string(),
  type: z.literal("number"),
  label: z.string(),
  required: z.boolean().default(false),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
})

export type NumberField = z.infer<typeof NumberFieldSchema>

export const FieldSchema = z.discriminatedUnion("type", [
  TextFieldSchema,
  TextAreaFieldSchema,
  DropdownFieldSchema,
  CheckboxFieldSchema,
  RadioFieldSchema,
  DateFieldSchema,
  NumberFieldSchema,
])

export type Field = z.infer<typeof FieldSchema>
