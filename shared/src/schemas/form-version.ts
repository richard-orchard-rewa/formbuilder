import { z } from "zod"
import { FieldSchema } from "./field.js"

// The field/layout definition.
export const FormSchemaSchema = z.object({
  fields: z.array(FieldSchema),
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
  publishedBy: z.string().nullable(),
})

export type FormVersion = z.infer<typeof FormVersionSchema>

// A request with no body at all (publishedBy is optional) arrives as `null`
// rather than `undefined` once Fastify's JSON body parser runs, so an empty
// body is normalized to `{}` before validating the shape.
export const PublishFormVersionSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    publishedBy: z.string().min(1).optional(),
  }),
)

export type PublishFormVersion = z.infer<typeof PublishFormVersionSchema>

// The version-history view (US-1.4) speaks in "active" rather than
// "published" — the DB's "published" status always means the single
// currently-active version, so the two terms mean the same thing here.
export const FormVersionSummarySchema = z.object({
  id: z.string(),
  version: z.number().int(),
  status: z.enum(["draft", "active", "superseded"]),
  publishedAt: z.iso.datetime().nullable(),
  publishedBy: z.string().nullable(),
})

export type FormVersionSummary = z.infer<typeof FormVersionSummarySchema>

export const FormVersionHistorySchema = z.array(FormVersionSummarySchema)
