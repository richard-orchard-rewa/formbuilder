import { z } from "zod"
import { FieldSchema } from "./field.js"

// The template's current, always-mutable composition (US-8.2): which
// published modules it references, in order. Resolving this always uses
// each module's *current* published version -- the "live reference"
// decision -- so this is deliberately not versioned itself.
export const SessionTemplateModuleSchema = z.object({
  moduleId: z.string(),
  name: z.string(),
})

export type SessionTemplateModule = z.infer<typeof SessionTemplateModuleSchema>

export const SessionTemplateModulesSchema = z.array(SessionTemplateModuleSchema)

// Replaces the template's whole composition in one call (US-8.2), mirroring
// how a form/module's whole field list is replaced by one PUT rather than
// granular add/remove/reorder endpoints.
export const SetSessionTemplateModulesSchema = z.object({
  moduleIds: z.array(z.string()),
})

export type SetSessionTemplateModules = z.infer<
  typeof SetSessionTemplateModulesSchema
>

// The combined, read-only field list resolved from a template's modules
// (US-8.3 preview, and what a published version's `schema` holds) -- the
// same shape as ModuleSchemaSchema/FormSchemaSchema, kept as its own type
// per the "independent top-level concepts" decision.
export const SessionTemplateSchemaSchema = z.object({
  fields: z.array(FieldSchema),
})

export type SessionTemplateSchema = z.infer<typeof SessionTemplateSchemaSchema>

// One module's snapshotted version inside a published session template
// version (US-8.4, US-8.8): which module, which of its versions, in what
// order (array order is composition order).
export const SessionTemplateModuleSnapshotSchema = z.object({
  moduleId: z.string(),
  moduleName: z.string(),
  moduleVersionId: z.string(),
  moduleVersionNumber: z.number().int(),
})

export type SessionTemplateModuleSnapshot = z.infer<
  typeof SessionTemplateModuleSnapshotSchema
>

export const SessionTemplateVersionSchema = z.object({
  id: z.string(),
  sessionTemplateId: z.string(),
  version: z.number().int(),
  modules: z.array(SessionTemplateModuleSnapshotSchema),
  // The combined fields resolved from each snapshotted module version, in
  // composition order -- what a fill-out/preview renders (US-8.5).
  schema: SessionTemplateSchemaSchema,
  status: z.enum(["published", "superseded"]),
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime(),
  publishedBy: z.string().nullable(),
})

export type SessionTemplateVersion = z.infer<typeof SessionTemplateVersionSchema>

// Mirrors PublishFormVersionSchema/PublishModuleVersionSchema's null-body
// preprocessing.
export const PublishSessionTemplateSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    publishedBy: z.string().min(1).optional(),
  }),
)

export type PublishSessionTemplate = z.infer<typeof PublishSessionTemplateSchema>

// The version-history view (US-8.7) speaks in "active" rather than
// "published", mirroring FormVersionSummarySchema.
export const SessionTemplateVersionSummarySchema = z.object({
  id: z.string(),
  version: z.number().int(),
  status: z.enum(["active", "superseded"]),
  publishedAt: z.iso.datetime(),
  publishedBy: z.string().nullable(),
})

export type SessionTemplateVersionSummary = z.infer<
  typeof SessionTemplateVersionSummarySchema
>

export const SessionTemplateVersionHistorySchema = z.array(
  SessionTemplateVersionSummarySchema,
)
