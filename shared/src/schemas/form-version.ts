import { z } from "zod"

// The field/layout definition. Loosely typed for now — the concrete field
// shapes land with the builder-gui epic (US-2.x).
export const FormSchemaSchema = z.object({
  fields: z.array(z.unknown()),
})

export type FormSchema = z.infer<typeof FormSchemaSchema>

export const FormVersionSchema = z.object({
  id: z.string(),
  formId: z.string(),
  version: z.number().int(),
  schema: FormSchemaSchema,
  status: z.enum(["draft", "published", "superseded"]),
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
})

export type FormVersion = z.infer<typeof FormVersionSchema>
