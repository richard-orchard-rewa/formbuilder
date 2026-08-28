import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"
import { CreateFormSchema, FormListSchema, FormSummarySchema, FormVersionSchema } from "shared"
import { NoDraftVersionError } from "./repositories/form-versions.js"
import type { FormBuilderService } from "./services/form-builder.js"
import type { FormVersionsService } from "./services/form-versions.js"

const FormParamsSchema = z.object({ formId: z.string() })
const ErrorResponseSchema = z.object({ message: z.string() })

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
          response: { 200: FormVersionSchema, 409: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.publishDraft(
            request.params.formId,
          )
          return reply.code(200).send({
            ...version,
            createdAt: version.createdAt.toISOString(),
            publishedAt: version.publishedAt?.toISOString() ?? null,
          })
        } catch (error) {
          if (error instanceof NoDraftVersionError) {
            return reply.code(409).send({ message: error.message })
          }
          throw error
        }
      },
    )
  }
}
