import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"
import {
  SubmissionSchema,
  SubmissionValidationErrorSchema,
  SubmitFormSchema,
} from "shared"
import {
  MissingRequiredFieldsError,
  NoActiveVersionError,
} from "./services/submissions.js"
import type { SubmissionsService } from "./services/submissions.js"

const FormParamsSchema = z.object({ formId: z.string() })
const ErrorResponseSchema = z.object({ message: z.string() })

// One plugin per capability (US-0.5): submitting a completed form against
// its active version.
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
          )
          return reply.code(201).send({
            ...submission,
            submittedAt: submission.submittedAt.toISOString(),
          })
        } catch (error) {
          if (error instanceof MissingRequiredFieldsError) {
            return reply.code(400).send({
              message: error.message,
              missingFieldIds: error.missingFieldIds,
            })
          }
          if (error instanceof NoActiveVersionError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )
  }
}
