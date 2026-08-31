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
})

export type SubmitForm = z.infer<typeof SubmitFormSchema>

export const SubmissionSchema = z.object({
  id: z.string(),
  formId: z.string(),
  formVersionId: z.string(),
  submittedBy: z.string().nullable(),
  submittedAt: z.iso.datetime(),
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
