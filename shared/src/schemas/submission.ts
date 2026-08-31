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
  submittedBy: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
})

export type Submission = z.infer<typeof SubmissionSchema>

// A bare-bones per-form list, just enough to navigate to one submission
// (US-5.1) -- filtering by date range/version and showing richer columns
// is US-5.3's job, not this one.
export const SubmissionSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "submitted"]),
  createdAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
})

export type SubmissionSummary = z.infer<typeof SubmissionSummarySchema>

export const SubmissionListSchema = z.array(SubmissionSummarySchema)

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

// One row of a submission's edit history (US-5.2): the data as it stood
// immediately before that edit was applied, plus who made it and when.
export const SubmissionEditSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  previousData: z.record(z.string(), z.unknown()),
  editedBy: z.string().nullable(),
  editedAt: z.iso.datetime(),
})

export type SubmissionEdit = z.infer<typeof SubmissionEditSchema>

export const SubmissionEditListSchema = z.array(SubmissionEditSchema)

// Returned when required fields are missing at submission time (US-3.5).
export const SubmissionValidationErrorSchema = z.object({
  message: z.string(),
  missingFieldIds: z.array(z.string()),
})

export type SubmissionValidationError = z.infer<
  typeof SubmissionValidationErrorSchema
>
