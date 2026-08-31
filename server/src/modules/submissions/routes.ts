import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"
import {
  SaveDraftSubmissionSchema,
  SubmissionSchema,
  SubmissionValidationErrorSchema,
  SubmitFormSchema,
} from "shared"
import {
  DraftNotFoundError,
  MissingRequiredFieldsError,
  NoActiveVersionError,
} from "./services/submissions.js"
import type { SubmissionRow } from "./repositories/submissions.js"
import type { SubmissionsService } from "./services/submissions.js"

const FormParamsSchema = z.object({ formId: z.string() })
const DraftParamsSchema = z.object({
  formId: z.string(),
  submissionId: z.string(),
})
const ErrorResponseSchema = z.object({ message: z.string() })

function serialize(submission: SubmissionRow) {
  return {
    ...submission,
    data: submission.data as Record<string, unknown>,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
  }
}

// One plugin per capability (US-0.5): submitting a completed form against
// its active version, and saving/resuming an in-progress draft (US-4.3).
export function submissionsPlugin(
  service: SubmissionsService,
): FastifyPluginAsync {
  return async (app) => {
    const typed = app.withTypeProvider<ZodTypeProvider>()

    typed.post(
      "/api/forms/:formId/submissions",
      {
        schema: {
          params: FormParamsSchema,
          body: SubmitFormSchema,
          response: {
            201: SubmissionSchema,
            400: SubmissionValidationErrorSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const submission = await service.submit(
            request.params.formId,
            request.body.data,
            request.body.submittedBy,
            request.body.submissionId,
          )
          return reply.code(201).send(serialize(submission))
        } catch (error) {
          if (error instanceof MissingRequiredFieldsError) {
            return reply.code(400).send({
              message: error.message,
              missingFieldIds: error.missingFieldIds,
            })
          }
          if (
            error instanceof NoActiveVersionError ||
            error instanceof DraftNotFoundError
          ) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.post(
      "/api/forms/:formId/submissions/draft",
      {
        schema: {
          params: FormParamsSchema,
          body: SaveDraftSubmissionSchema,
          response: {
            200: SubmissionSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const submission = await service.saveDraft(
            request.params.formId,
            request.body.data,
            request.body.submissionId,
          )
          return reply.code(200).send(serialize(submission))
        } catch (error) {
          if (error instanceof NoActiveVersionError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/forms/:formId/submissions/draft/:submissionId",
      {
        schema: {
          params: DraftParamsSchema,
          response: {
            200: SubmissionSchema.nullable(),
          },
        },
      },
      async (request, reply) => {
        const submission = await service.getDraft(
          request.params.formId,
          request.params.submissionId,
        )
        return reply
          .code(200)
          .send(submission ? serialize(submission) : null)
      },
    )
  }
}
