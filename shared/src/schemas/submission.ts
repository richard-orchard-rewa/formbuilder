import { z } from "zod"

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

// Returned when required fields are missing at submission time (US-3.5).
export const SubmissionValidationErrorSchema = z.object({
  message: z.string(),
  missingFieldIds: z.array(z.string()),
})

export type SubmissionValidationError = z.infer<
  typeof SubmissionValidationErrorSchema
>
