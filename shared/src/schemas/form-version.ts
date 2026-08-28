import { z } from "zod"

export const FormVersionSchema = z.object({
  id: z.string(),
  formId: z.string(),
  version: z.number().int(),
  status: z.enum(["draft", "published", "superseded"]),
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
})

export type FormVersion = z.infer<typeof FormVersionSchema>
