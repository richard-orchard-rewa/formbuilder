import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"
import {
  EditSubmissionSchema,
  SaveDraftSubmissionSchema,
  SubmissionDetailSchema,
  SubmissionEditListSchema,
  SubmissionListQuerySchema,
  SubmissionListSchema,
  SubmissionSchema,
  SubmissionValidationErrorSchema,
  SubmitFormSchema,
  type FormSchema,
} from "shared"
import {
  DraftNotFoundError,
  MissingRequiredFieldsError,
  NoActiveVersionError,
  SubmissionNotFoundError,
} from "./services/submissions.js"
import type {
  SubmissionDetailRow,
  SubmissionEditRow,
  SubmissionRow,
} from "./repositories/submissions.js"
import type { SubmissionsService } from "./services/submissions.js"

const FormParamsSchema = z.object({ formId: z.string() })
const SubmissionParamsSchema = z.object({
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

function serializeDetail(submission: SubmissionDetailRow) {
  return {
    ...serialize(submission),
    formVersionNumber: submission.formVersionNumber,
    // The jsonb column is untyped at the DB layer; the app is the only
    // writer and always writes the FormSchema shape.
    schema: submission.schema as FormSchema,
  }
}

function serializeEdit(edit: SubmissionEditRow) {
  return {
    ...edit,
    previousData: edit.previousData as Record<string, unknown>,
    editedAt: edit.editedAt.toISOString(),
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
          params: SubmissionParamsSchema,
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

    typed.get(
      "/api/forms/:formId/submissions",
      {
        schema: {
          params: FormParamsSchema,
          querystring: SubmissionListQuerySchema,
          response: { 200: SubmissionListSchema },
        },
      },
      async (request) => {
        const { from, to, formVersionNumber } = request.query
        const submissions = await service.listByForm(request.params.formId, {
          // `to` is a calendar date; bound it at the end of that day so the
          // range stays inclusive of everything submitted on it.
          from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
          to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
          formVersionNumber,
        })
        return submissions.map((submission) => ({
          ...submission,
          createdAt: submission.createdAt.toISOString(),
          submittedAt: submission.submittedAt?.toISOString() ?? null,
        }))
      },
    )

    typed.get(
      "/api/forms/:formId/submissions/:submissionId",
      {
        schema: {
          params: SubmissionParamsSchema,
          response: {
            200: SubmissionDetailSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const submission = await service.getById(
          request.params.formId,
          request.params.submissionId,
        )
        if (!submission) {
          return reply.code(404).send({
            message: `No submission ${request.params.submissionId} found for form ${request.params.formId}`,
          })
        }
        return reply.code(200).send(serializeDetail(submission))
      },
    )

    typed.put(
      "/api/forms/:formId/submissions/:submissionId",
      {
        schema: {
          params: SubmissionParamsSchema,
          body: EditSubmissionSchema,
          response: {
            200: SubmissionSchema,
            400: SubmissionValidationErrorSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const submission = await service.edit(
            request.params.formId,
            request.params.submissionId,
            request.body.data,
            request.body.editedBy,
          )
          return reply.code(200).send(serialize(submission))
        } catch (error) {
          if (error instanceof MissingRequiredFieldsError) {
            return reply.code(400).send({
              message: error.message,
              missingFieldIds: error.missingFieldIds,
            })
          }
          if (error instanceof SubmissionNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/forms/:formId/submissions/:submissionId/edits",
      {
        schema: {
          params: SubmissionParamsSchema,
          response: { 200: SubmissionEditListSchema },
        },
      },
      async (request) => {
        const edits = await service.getEditHistory(
          request.params.submissionId,
        )
        return edits.map(serializeEdit)
      },
    )
  }
}
