import { z } from "zod"

// Only the types needed to make the drag-and-drop canvas work end to end
// (US-2.1). Per-type configuration (max length, options list, required
// flag, ...) lands with their own field-types epic issues.
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

export const FieldSchema = z.object({
  id: z.string(),
  type: FieldTypeSchema,
  label: z.string(),
})

export type Field = z.infer<typeof FieldSchema>
