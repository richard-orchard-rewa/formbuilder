import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import {
  AttributeCandidateListSchema,
  BindingAnchorSchema,
  BindingDescriptorListSchema,
  BindingOptionsSchema,
  ClientAnchorSchema,
  CreateBindingRequestSchema,
  ManagedBindingListSchema,
  ManagedBindingSchema,
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
// on submit (see BoundFieldsService). Plus the binding creator's admin API,
// relayed as-is: the DBS enforces every rule, this only passes them on.
export function bindingsPlugin(client: BindingClient): FastifyPluginAsync {
  return async (app) => {
    const typed = app.withTypeProvider<ZodTypeProvider>()

    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof BindingServiceError) {
        // 404/422 are the DBS's own verdicts; anything else means it
        // couldn't be reached or failed.
        const status = error.status === 404 || error.status === 422 ? error.status : 502
        return reply.code(status).send({ message: error.message })
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

    typed.get(
      "/api/binding-admin/attributes",
      {
        schema: {
          querystring: z.object({ anchor: BindingAnchorSchema.default("client") }),
          response: { 200: AttributeCandidateListSchema, 502: ErrorSchema },
        },
      },
      async (request) => client.listCandidates(request.query.anchor),
    )

    typed.get(
      "/api/binding-admin/bindings",
      { schema: { response: { 200: ManagedBindingListSchema, 502: ErrorSchema } } },
      async () => client.listManaged(),
    )

    typed.post(
      "/api/binding-admin/bindings",
      {
        schema: {
          body: CreateBindingRequestSchema,
          response: { 200: ManagedBindingSchema, 422: ErrorSchema, 502: ErrorSchema },
        },
      },
      async (request) => client.saveDraft(request.body),
    )

    typed.post(
      "/api/binding-admin/bindings/:key/publish",
      {
        schema: {
          params: z.object({ key: z.string() }),
          response: {
            200: ManagedBindingSchema,
            404: ErrorSchema,
            422: ErrorSchema,
            502: ErrorSchema,
          },
        },
      },
      async (request) => client.publish(request.params.key),
    )
  }
}
