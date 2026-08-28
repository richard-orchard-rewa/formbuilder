import { z } from "zod"

// The field types available so far (US-3.1/3.2/3.3 add the rest). Each
// variant's own constraints (e.g. dropdown's `options`) are what
// buildSubmissionSchema below turns into the actual validation rule for
// that field.
export const TextFieldSchema = z.object({
  type: z.literal("text"),
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(false),
})

export const TextareaFieldSchema = z.object({
  type: z.literal("textarea"),
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(false),
})

export const DropdownFieldSchema = z.object({
  type: z.literal("dropdown"),
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1)).min(1),
})

export const FormFieldSchema = z.discriminatedUnion("type", [
  TextFieldSchema,
  TextareaFieldSchema,
  DropdownFieldSchema,
])

export type FormField = z.infer<typeof FormFieldSchema>

export const FormDefinitionSchema = z.object({
  fields: z.array(FormFieldSchema),
})

export type FormDefinition = z.infer<typeof FormDefinitionSchema>
