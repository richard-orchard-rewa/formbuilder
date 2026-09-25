import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import {
  BindingAnchorSchema,
  BindingDescriptorListSchema,
  BindingOptionsSchema,
  ClientAnchorSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
} from "shared"
import { z } from "zod"
import { BindingServiceError, type BindingClient } from "./binding-client.js"

const ErrorSchema = z.object({ message: z.string() })

// The browser's view of the Data Binding Service, relayed through
// form-builder's own API so the client only ever talks to its own server
// (and so auth, when it lands, is enforced in one place). Build time: the
// dictionary and lookup options. Fill time: finding a client and resolving
// current values. Writes don't come through here -- they happen server-side
// on submit (see BoundFieldsService).
export function bindingsPlugin(client: BindingClient): FastifyPluginAsync {
  return async (app) => {
    const typed = app.withTypeProvider<ZodTypeProvider>()

    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof BindingServiceError) {
        return reply
          .code(error.status === 404 ? 404 : 502)
          .send({ message: error.message })
      }
      return reply.send(error)
    })

    typed.get(
      "/api/bindings",
      {
        schema: {
          querystring: z.object({ anchor: BindingAnchorSchema.optional() }),
          response: { 200: BindingDescriptorListSchema, 502: ErrorSchema },
        },
      },
      async (request) => client.listBindings(request.query.anchor),
    )

    typed.get(
      "/api/bindings/:key/options",
      {
        schema: {
          params: z.object({ key: z.string() }),
          response: {
            200: BindingOptionsSchema,
            404: ErrorSchema,
            502: ErrorSchema,
          },
        },
      },
      async (request) => client.getOptions(request.params.key),
    )

    typed.get(
      "/api/anchors/client",
      {
        schema: {
          querystring: z.object({ clientNumber: z.string().trim().min(1) }),
          response: {
            200: ClientAnchorSchema,
            404: ErrorSchema,
            502: ErrorSchema,
          },
        },
      },
      async (request) => client.findClient(request.query.clientNumber),
    )

    typed.post(
      "/api/bindings/resolve",
      {
        schema: {
          body: ResolveRequestSchema,
          response: {
            200: ResolveResponseSchema,
            404: ErrorSchema,
            502: ErrorSchema,
          },
        },
      },
      async (request) => client.resolve(request.body),
    )
  }
}
