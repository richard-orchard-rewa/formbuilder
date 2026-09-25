import Fastify from "fastify"
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod"
import type { Logger } from "pino"
import {
  BindingAnchorSchema,
  BindingDescriptorListSchema,
  BindingDescriptorSchema,
  BindingOptionsSchema,
  ClientAnchorSchema,
  CommitRequestSchema,
  CommitResponseSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
} from "shared"
import { z } from "zod"
import {
  AnchorNotFoundError,
  NoOptionsError,
  UnknownBindingError,
  type BindingService,
} from "./service.js"

const ErrorSchema = z.object({ message: z.string() })

// The Data Binding Service's HTTP contract (docs/proposals/databound-fields.md):
// a self-describing dictionary (GET /bindings...) plus resolve/commit.
export function buildApp(service: BindingService, logger: Logger) {
  const app = Fastify({ loggerInstance: logger })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof UnknownBindingError || error instanceof NoOptionsError) {
      return reply.code(404).send({ message: error.message })
    }
    if (error instanceof AnchorNotFoundError) {
      return reply.code(404).send({ message: error.message })
    }
    return reply.send(error)
  })

  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get("/health", async () => ({ ok: true }))

  typed.get(
    "/bindings",
    {
      schema: {
        querystring: z.object({ anchor: BindingAnchorSchema.optional() }),
        response: { 200: BindingDescriptorListSchema },
      },
    },
    async (request) => service.listBindings(request.query.anchor),
  )

  typed.get(
    "/bindings/:key",
    {
      schema: {
        params: z.object({ key: z.string() }),
        response: { 200: BindingDescriptorSchema, 404: ErrorSchema },
      },
    },
    async (request) => service.getBinding(request.params.key),
  )

  typed.get(
    "/bindings/:key/options",
    {
      schema: {
        params: z.object({ key: z.string() }),
        response: { 200: BindingOptionsSchema, 404: ErrorSchema },
      },
    },
    async (request) => service.getOptions(request.params.key),
  )

  typed.get(
    "/anchors/client",
    {
      schema: {
        querystring: z.object({ clientNumber: z.string().trim().min(1) }),
        response: { 200: ClientAnchorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const client = await service.findClient(request.query.clientNumber)
      if (!client) {
        return reply.code(404).send({ message: "No matching client" })
      }
      return client
    },
  )

  typed.post(
    "/resolve",
    {
      schema: {
        body: ResolveRequestSchema,
        response: { 200: ResolveResponseSchema, 404: ErrorSchema },
      },
    },
    async (request) => service.resolve(request.body),
  )

  typed.post(
    "/commit",
    {
      schema: {
        body: CommitRequestSchema,
        response: { 200: CommitResponseSchema, 404: ErrorSchema },
      },
    },
    async (request) => service.commit(request.body),
  )

  return app
}
