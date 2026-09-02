import { z } from "zod"
import { FormSchemaSchema } from "./form-version.js"

// Submitted values keyed by field id. Loosely typed for now, matching
// FormSchemaSchema's own field looseness ahead of the full field-types
// epic.
export const SubmitFormSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  // Freeform identifier of who's submitting, mirroring
  // PublishFormVersionSchema's `publishedBy` -- there's no auth/user system
  // yet, so this is whatever the caller supplies (US-4.2).
  submittedBy: z.string().min(1).optional(),
  // When resuming a draft (US-4.3), finalizes that exact row instead of
  // inserting a new one. Omitted for a direct, one-shot submission.
  submissionId: z.string().optional(),
})

export type SubmitForm = z.infer<typeof SubmitFormSchema>

// A draft is never validated against required fields -- that's the whole
// point of letting someone save an incomplete form and finish it later
// (US-4.3). `submissionId` resumes (and overwrites) that exact draft row;
// omitted, a new draft is created.
export const SaveDraftSubmissionSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  submissionId: z.string().optional(),
})

export type SaveDraftSubmission = z.infer<typeof SaveDraftSubmissionSchema>

export const SubmissionSchema = z.object({
  id: z.string(),
  formId: z.string(),
  formVersionId: z.string(),
  status: z.enum(["draft", "submitted"]),
  data: z.record(z.string(), z.unknown()),
  // Values carried over from an older version by a migration (US-6.1) that
  // either had no counterpart in this submission's version or couldn't be
  // safely converted to its replacement's type -- kept visible rather than
  // discarded, keyed by their original field id.
  legacyData: z.record(z.string(), z.unknown()).nullable(),
  // Set when this row was produced by migrating another submission onto a
  // newer version (US-6.1), rather than being captured directly.
  migratedFromSubmissionId: z.string().nullable(),
  submittedBy: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
})

export type Submission = z.infer<typeof SubmissionSchema>

// A per-form list an admin can review or report on (US-5.1, US-5.3):
// status, the version it was captured against, and when.
export const SubmissionSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "submitted"]),
  formVersionNumber: z.number().int(),
  migratedFromSubmissionId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
})

export type SubmissionSummary = z.infer<typeof SubmissionSummarySchema>

export const SubmissionListSchema = z.array(SubmissionSummarySchema)

// Filters for the submission list (US-5.3). `from`/`to` bound `createdAt`
// (inclusive) rather than `submittedAt` so a date-range filter still
// matches drafts, which have no `submittedAt` yet. `formVersionNumber`
// narrows to submissions captured against one specific version of the
// form. All optional -- an unfiltered request lists everything.
export const SubmissionListQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  formVersionNumber: z.coerce.number().int().optional(),
})

export type SubmissionListQuery = z.infer<typeof SubmissionListQuerySchema>

// A single submission plus the exact schema (and version number) it was
// captured against, so it always renders correctly even if the form has
// since been republished with a different structure (US-5.1).
export const SubmissionDetailSchema = SubmissionSchema.extend({
  formVersionNumber: z.number().int(),
  schema: FormSchemaSchema,
})

export type SubmissionDetail = z.infer<typeof SubmissionDetailSchema>

// Corrects a previously submitted submission's values (US-5.2). Validated
// against the exact schema version the submission was originally captured
// against, not the form's current active version.
export const EditSubmissionSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  // Freeform identifier of who made the edit, mirroring `submittedBy` --
  // there's no auth/user system yet, so this is whatever the caller
  // supplies.
  editedBy: z.string().min(1).optional(),
})

export type EditSubmission = z.infer<typeof EditSubmissionSchema>

// One version of a submission across its lifetime (US-5.2, US-6.1, US-6.2):
// a full snapshot of the data as it stood during [activeFrom, activeTo),
// archived by a database trigger the moment an edit superseded it (SCD
// Type 2), plus who made the edit that produced it. `activeTo` is null for
// the current, still-live version -- every earlier one was closed out by a
// later edit and always has one.
export const SubmissionHistorySchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  formVersionId: z.string(),
  data: z.record(z.string(), z.unknown()),
  legacyData: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(["draft", "submitted"]),
  submittedBy: z.string().nullable(),
  migratedFromSubmissionId: z.string().nullable(),
  editedBy: z.string().nullable(),
  activeFrom: z.iso.datetime(),
  activeTo: z.iso.datetime().nullable(),
})

export type SubmissionHistory = z.infer<typeof SubmissionHistorySchema>

export const SubmissionHistoryListSchema = z.array(SubmissionHistorySchema)

// One version of a submission plus the exact schema (and version number)
// that was active at its `activeFrom` (US-6.4), so a historical version
// always renders correctly -- mirroring SubmissionDetailSchema's approach
// for the current version.
export const SubmissionHistoryDetailSchema = SubmissionHistorySchema.extend({
  formVersionNumber: z.number().int(),
  schema: FormSchemaSchema,
})

export type SubmissionHistoryDetail = z.infer<
  typeof SubmissionHistoryDetailSchema
>

// Point-in-time lookup (US-6.2): which version of a submission was active
// at `asOf`, per the SCD Type 2 design -- "what did this look like on date
// X".
export const SubmissionHistoryAtQuerySchema = z.object({
  asOf: z.iso.datetime(),
})

export type SubmissionHistoryAtQuery = z.infer<
  typeof SubmissionHistoryAtQuerySchema
>

// Returned when required fields are missing at submission time (US-3.5).
export const SubmissionValidationErrorSchema = z.object({
  message: z.string(),
  missingFieldIds: z.array(z.string()),
})

export type SubmissionValidationError = z.infer<
  typeof SubmissionValidationErrorSchema
>
