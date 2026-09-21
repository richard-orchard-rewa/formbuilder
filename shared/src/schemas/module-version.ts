import { z } from "zod"
import { FieldSchema } from "./field.js"

// Same shape as FormSchemaSchema, but kept as its own type so a module's
// contract doesn't structurally depend on `form.ts` -- modules and forms
// are independent top-level concepts (see docs/proposals/modules-and-
// session-templates.md), not one built on the other.
export const ModuleSchemaSchema = z.object({
  fields: z.array(FieldSchema),
})

export type ModuleSchema = z.infer<typeof ModuleSchemaSchema>

export const ModuleVersionSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  version: z.number().int(),
  schema: ModuleSchemaSchema,
  status: z.enum(["draft", "published", "superseded"]),
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  publishedBy: z.string().nullable(),
})

export type ModuleVersion = z.infer<typeof ModuleVersionSchema>

// Mirrors PublishFormVersionSchema: a bodyless request arrives as `null`
// once Fastify's JSON parser runs, so it's normalized to `{}` first.
export const PublishModuleVersionSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    publishedBy: z.string().min(1).optional(),
  }),
)

export type PublishModuleVersion = z.infer<typeof PublishModuleVersionSchema>
