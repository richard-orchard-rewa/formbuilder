import { z } from "zod"
import { BindingCommitResultSchema, BoundValuesSchema } from "./binding.js"
import { SessionTemplateSchemaSchema } from "./session-template-version.js"

// Which session a session note is for, who took part, and what their bound
// values were when it was opened. Participant-scoped values sit in `data`
// under `participants[<participant anchor id>]`.
export const SessionTemplateBindingContextSchema = z.object({
  session: z.guid(),
  participants: z.array(z.object({ participant: z.guid(), client: z.guid() })),
  baseline: z
    .object({
      session: BoundValuesSchema.optional(),
      participants: z
        .record(
          z.string(),
          z.object({
            participant: BoundValuesSchema.optional(),
            client: BoundValuesSchema.optional(),
          }),
        )
        .optional(),
    })
    .optional(),
})

export type SessionTemplateBindingContext = z.infer<
  typeof SessionTemplateBindingContextSchema
>

// What happened to each bound value, grouped by where it was written.
export const SessionTemplateBindingResultsSchema = z.object({
  session: z.record(z.string(), BindingCommitResultSchema).optional(),
  participants: z
    .record(z.string(), z.record(z.string(), BindingCommitResultSchema))
    .optional(),
})

export type SessionTemplateBindingResults = z.infer<
  typeof SessionTemplateBindingResultsSchema
>


// US-8.5: fills out a published session template version. No draft-save --
// out of scope for Epic US-8 (see docs/proposals/modules-and-session-
// templates.md) -- so unlike SubmitFormSchema there's no `submissionId` to
// resume.
export const SubmitSessionTemplateSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  submittedBy: z.string().min(1).optional(),
  binding: SessionTemplateBindingContextSchema.optional(),
})

export type SubmitSessionTemplate = z.infer<typeof SubmitSessionTemplateSchema>

export const SessionTemplateSubmissionSchema = z.object({
  id: z.string(),
  sessionTemplateId: z.string(),
  sessionTemplateVersionId: z.string(),
  data: z.record(z.string(), z.unknown()),
  submittedBy: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  bindingResults: SessionTemplateBindingResultsSchema.optional(),
})

export type SessionTemplateSubmission = z.infer<
  typeof SessionTemplateSubmissionSchema
>

// A per-template list an admin can review (US-8.5's natural companion,
// mirrors SubmissionSummarySchema): which version it was captured
// against, and when.
export const SessionTemplateSubmissionSummarySchema = z.object({
  id: z.string(),
  sessionTemplateVersionNumber: z.number().int(),
  submittedBy: z.string().nullable(),
  submittedAt: z.iso.datetime(),
})

export type SessionTemplateSubmissionSummary = z.infer<
  typeof SessionTemplateSubmissionSummarySchema
>

export const SessionTemplateSubmissionListSchema = z.array(
  SessionTemplateSubmissionSummarySchema,
)

// One submission plus the exact schema (and version number) it was
// captured against, so it renders correctly even if the template has
// since been republished with a different composition -- mirrors
// SubmissionDetailSchema.
export const SessionTemplateSubmissionDetailSchema =
  SessionTemplateSubmissionSchema.extend({
    sessionTemplateVersionNumber: z.number().int(),
    schema: SessionTemplateSchemaSchema,
  })

export type SessionTemplateSubmissionDetail = z.infer<
  typeof SessionTemplateSubmissionDetailSchema
>
