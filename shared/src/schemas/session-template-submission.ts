import { z } from "zod"

// US-8.5: fills out a published session template version. No draft-save --
// out of scope for Epic US-8 (see docs/proposals/modules-and-session-
// templates.md) -- so unlike SubmitFormSchema there's no `submissionId` to
// resume.
export const SubmitSessionTemplateSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  submittedBy: z.string().min(1).optional(),
})

export type SubmitSessionTemplate = z.infer<typeof SubmitSessionTemplateSchema>

export const SessionTemplateSubmissionSchema = z.object({
  id: z.string(),
  sessionTemplateId: z.string(),
  sessionTemplateVersionId: z.string(),
  data: z.record(z.string(), z.unknown()),
  submittedBy: z.string().nullable(),
  submittedAt: z.iso.datetime(),
})

export type SessionTemplateSubmission = z.infer<
  typeof SessionTemplateSubmissionSchema
>
