import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { CreateFormSchema, FormListSchema, FormSummarySchema } from "shared"
import type { FormBuilderService } from "./services/form-builder.js"

// One plugin per capability (US-0.5): everything the form-builder feature
// exposes over HTTP lives here, mounted once from the app's entry point.
export function formBuilderPlugin(
  service: FormBuilderService,
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
        const row = await service.createForm(request.body.name)
        return reply
          .code(201)
          .send({ ...row, createdAt: row.createdAt.toISOString() })
      },
    )
  }
}
