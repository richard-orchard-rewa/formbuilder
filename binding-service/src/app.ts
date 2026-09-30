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
  AttributeCandidateListSchema,
  CaseContextSchema,
  ClientAnchorSchema,
  CommitRequestSchema,
  CreateBindingRequestSchema,
  ManagedBindingListSchema,
  ManagedBindingSchema,
  CommitResponseSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
  SessionAnchorListSchema,
  SessionParticipantSchema,
} from "shared"
import { z } from "zod"
import { StoreReadError } from "./adapters/adapter.js"
import {
  BindingNotFoundError,
  BindingRuleError,
  type BindingCreator,
} from "./creator.js"
import {
  AnchorMismatchError,
  AnchorNotFoundError,
  NoOptionsError,
  UnknownBindingError,
  type BindingService,
} from "./service.js"

const ErrorSchema = z.object({ message: z.string() })

// The Data Binding Service's HTTP contract (docs/proposals/databound-fields.md):
// a self-describing dictionary (GET /bindings...) plus resolve/commit for
// forms, and /admin/... for the binding creator.
export function buildApp(
  service: BindingService,
  creator: BindingCreator,
  logger: Logger,
) {
  const app = Fastify({ loggerInstance: logger })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof UnknownBindingError || error instanceof NoOptionsError) {
      return reply.code(404).send({ message: error.message })
    }
    if (error instanceof AnchorNotFoundError || error instanceof BindingNotFoundError) {
      return reply.code(404).send({ message: error.message })
    }
    if (error instanceof AnchorMismatchError) {
      return reply.code(400).send({ message: error.message })
    }
    if (error instanceof StoreReadError) {
      return reply.code(403).send({ message: error.message })
    }
    if (error instanceof BindingRuleError) {
      return reply.code(422).send({ message: error.message })
    }
    return reply.send(error)
  })

  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get("/health", async () => ({ ok: true }))

  // Self-describing: what this service is and what it offers, for whoever
  // is wiring a new consumer up to it.
  typed.get("/", async () => ({
    service: "Data Binding Service",
    description:
      "Owns the dictionary of data-bound fields and all access to the backing store. Consumers never talk to the store directly.",
    anchors: ["client", "case", "session", "participant"],
    strategies: ["attribute", "lookup", "choice"],
    endpoints: {
      "GET /bindings?anchor=client": "Published bindings, as descriptors a form can render",
      "GET /bindings/:key": "One binding's descriptor",
      "GET /bindings/:key/options": "A lookup binding's options, served live",
      "GET /anchors/client?clientNumber=": "Find the record to anchor on",
      "GET /anchors/sessions?clientNumber=": "A client's sessions, each with its participants (one anchor per person per session)",
      "GET /anchors/case?caseNumber=": "A case, with its clients and every session regarding it (each with its participants)",
      "GET /anchors/participants/:id": "Who a participant anchor is: their client and attendance",
      "POST /resolve": "Current values for bindings on an anchor",
      "POST /commit": "Write changed values, refusing to overwrite changes made since resolve",
      "GET /admin/attributes?anchor=client": "Binding creator: allow-listed attributes, with store limits and this service's own privileges",
      "GET /admin/bindings": "Binding creator: every binding and version",
      "POST /admin/bindings": "Binding creator: save a draft",
      "POST /admin/bindings/:key/publish": "Binding creator: publish a draft as an immutable version",
    },
  }))

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

  typed.get(
    "/anchors/sessions",
    {
      schema: {
        querystring: z.object({ clientNumber: z.string().trim().min(1) }),
        response: { 200: SessionAnchorListSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const sessions = await service.findSessions(request.query.clientNumber)
      if (!sessions) {
        return reply.code(404).send({ message: "No matching client" })
      }
      return sessions
    },
  )

  typed.get(
    "/anchors/case",
    {
      schema: {
        querystring: z.object({ caseNumber: z.string().trim().min(1) }),
        response: { 200: CaseContextSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const found = await service.findCase(request.query.caseNumber)
      if (!found) return reply.code(404).send({ message: "No matching case" })
      return found
    },
  )

  typed.get(
    "/anchors/participants/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: SessionParticipantSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const participant = await service.getParticipant(request.params.id)
      if (!participant) {
        return reply.code(404).send({ message: "No matching participant" })
      }
      return participant
    },
  )

  typed.post(
    "/resolve",
    {
      schema: {
        body: ResolveRequestSchema,
        response: { 200: ResolveResponseSchema, 400: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request) => service.resolve(request.body),
  )

  typed.post(
    "/commit",
    {
      schema: {
        body: CommitRequestSchema,
        response: { 200: CommitResponseSchema, 400: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request) => service.commit(request.body),
  )

  // --- Binding creator. No auth in the prototype; a real DBS restricts
  // these to data stewards. ---

  typed.get(
    "/admin/attributes",
    {
      schema: {
        querystring: z.object({ anchor: BindingAnchorSchema.default("client") }),
        response: { 200: AttributeCandidateListSchema },
      },
    },
    async (request) => creator.candidates(request.query.anchor),
  )

  typed.get(
    "/admin/bindings",
    { schema: { response: { 200: ManagedBindingListSchema } } },
    async () => creator.managed(),
  )

  typed.post(
    "/admin/bindings",
    {
      schema: {
        body: CreateBindingRequestSchema,
        response: { 200: ManagedBindingSchema, 422: ErrorSchema },
      },
    },
    async (request) => creator.saveDraft(request.body),
  )

  typed.post(
    "/admin/bindings/:key/publish",
    {
      schema: {
        params: z.object({ key: z.string() }),
        response: { 200: ManagedBindingSchema, 404: ErrorSchema, 422: ErrorSchema },
      },
    },
    async (request) => creator.publish(request.params.key),
  )

  return app
}
