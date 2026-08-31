import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"
import {
  CreateFormSchema,
  FormListSchema,
  FormSchemaSchema,
  FormSummarySchema,
  FormVersionHistorySchema,
  FormVersionSchema,
  PublishFormVersionSchema,
  type FormSchema,
} from "shared"
import {
  FormNotFoundError,
  NoDraftVersionError,
  type FormVersionRow,
} from "./repositories/form-versions.js"
import type { FormBuilderService } from "./services/form-builder.js"
import type { FormVersionsService } from "./services/form-versions.js"

const FormParamsSchema = z.object({ formId: z.string() })
const ErrorResponseSchema = z.object({ message: z.string() })

function serializeVersion<
  T extends { schema: unknown; createdAt: Date; publishedAt: Date | null },
>(version: T) {
  return {
    ...version,
    // The jsonb column is untyped at the DB layer; the app is the only
    // writer and always writes the FormSchema shape.
    schema: version.schema as FormSchema,
    createdAt: version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
  }
}

// "published" is the DB's name for the single currently-active version; the
// version-history view (US-1.4) speaks in "active" instead.
function toHistoryStatus(status: FormVersionRow["status"]) {
  return status === "published" ? "active" : status
}

// One plugin per capability (US-0.5): everything the form-builder feature
// exposes over HTTP lives here, mounted once from the app's entry point.
export function formBuilderPlugin(
  service: FormBuilderService,
  versionsService: FormVersionsService,
): FastifyPluginAsync {
  return async (app) => {
    const typed = app.withTypeProvider<ZodTypeProvider>()

    typed.get(
      "/api/forms",
      { schema: { response: { 200: FormListSchema } } },
      async () => {
        const rows = await service.listForms()
        return rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        }))
      },
    )

    typed.post(
      "/api/forms",
      {
        schema: {
          body: CreateFormSchema,
          response: { 201: FormSummarySchema },
        },
      },
      async (request, reply) => {
        const row = await service.createForm(request.body)
        return reply
          .code(201)
          .send({ ...row, createdAt: row.createdAt.toISOString() })
      },
    )

    typed.post(
      "/api/forms/:formId/publish",
      {
        schema: {
          params: FormParamsSchema,
          body: PublishFormVersionSchema,
          response: { 200: FormVersionSchema, 409: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.publishDraft(
            request.params.formId,
            request.body.publishedBy,
          )
          return reply.code(200).send(serializeVersion(version))
        } catch (error) {
          if (error instanceof NoDraftVersionError) {
            return reply.code(409).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.put(
      "/api/forms/:formId/draft",
      {
        schema: {
          params: FormParamsSchema,
          body: FormSchemaSchema,
          response: { 200: FormVersionSchema, 404: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.editDraft(
            request.params.formId,
            request.body,
          )
          return reply.code(200).send(serializeVersion(version))
        } catch (error) {
          if (error instanceof FormNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/forms/:formId/draft",
      {
        schema: {
          params: FormParamsSchema,
          response: {
            200: FormVersionSchema.nullable(),
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.getDraft(
            request.params.formId,
          )
          return reply
            .code(200)
            .send(version ? serializeVersion(version) : null)
        } catch (error) {
          if (error instanceof FormNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/forms/:formId/active",
      {
        schema: {
          params: FormParamsSchema,
          response: {
            200: FormVersionSchema.nullable(),
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.getActiveVersion(
            request.params.formId,
          )
          return reply
            .code(200)
            .send(version ? serializeVersion(version) : null)
        } catch (error) {
          if (error instanceof FormNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/forms/:formId/versions",
      {
        schema: {
          params: FormParamsSchema,
          response: { 200: FormVersionHistorySchema, 404: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        try {
          const versions = await versionsService.listVersions(
            request.params.formId,
          )
          return versions.map((version) => ({
            id: version.id,
            version: version.version,
            status: toHistoryStatus(version.status),
            publishedAt: version.publishedAt?.toISOString() ?? null,
            publishedBy: version.publishedBy,
          }))
        } catch (error) {
          if (error instanceof FormNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )
  }
}
