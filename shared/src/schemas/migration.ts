import { z } from "zod"
import { FieldTypeSchema } from "./field.js"

// One decision for a source field that has no identical-id counterpart in
// the target version: either map its value onto a specific target field
// (subject to a type-safe coercion -- see the server's migration service)
// or drop it, in which case its value is preserved as legacy data rather
// than discarded outright (US-6.1). Fields whose id is unchanged between
// versions never need a mapping -- they carry over automatically.
export const FieldMappingSchema = z.discriminatedUnion("action", [
  z.object({
    sourceFieldId: z.string(),
    action: z.literal("map"),
    targetFieldId: z.string(),
  }),
  z.object({
    sourceFieldId: z.string(),
    action: z.literal("drop"),
  }),
])

export type FieldMapping = z.infer<typeof FieldMappingSchema>

// A field summary used to drive the migration-planning UI -- just enough to
// label and type a mapping choice, not the field's full configuration.
export const MigrationFieldSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  type: FieldTypeSchema,
})

export type MigrationFieldSummary = z.infer<typeof MigrationFieldSummarySchema>

// The computed diff between a source and target form version (US-6.1):
// fields present under the same id in both (carried over automatically),
// fields only in the source version (each needs an explicit FieldMapping
// decision), and the target version's own fields (the candidates a source
// field can be mapped onto).
export const MigrationPlanSchema = z.object({
  autoMappedFields: z.array(MigrationFieldSummarySchema),
  unmappedSourceFields: z.array(MigrationFieldSummarySchema),
  targetFields: z.array(MigrationFieldSummarySchema),
})

export type MigrationPlan = z.infer<typeof MigrationPlanSchema>

export const MigrateSubmissionRequestSchema = z.object({
  targetVersionId: z.string(),
  fieldMappings: z.array(FieldMappingSchema).default([]),
  migratedBy: z.string().min(1).optional(),
})

export type MigrateSubmissionRequest = z.infer<
  typeof MigrateSubmissionRequestSchema
>

export const MigrateVersionRequestSchema = z.object({
  targetVersionId: z.string(),
  fieldMappings: z.array(FieldMappingSchema).default([]),
  migratedBy: z.string().min(1).optional(),
})

export type MigrateVersionRequest = z.infer<typeof MigrateVersionRequestSchema>

// The outcome of a bulk version migration (US-6.1): how many source
// submissions were migrated, how many of those needed follow-up because a
// newly required field couldn't be filled from the mapping (and so were
// saved as drafts rather than submitted), and how many were left alone
// because they were already migrated to this target version before.
export const MigrationResultSchema = z.object({
  migratedCount: z.number().int(),
  needsFollowUpCount: z.number().int(),
  alreadyMigratedCount: z.number().int(),
})

export type MigrationResult = z.infer<typeof MigrationResultSchema>
