import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"
import {
  CreateModuleSchema,
  ModuleListSchema,
  ModuleSchemaSchema,
  ModuleSummarySchema,
  ModuleVersionSchema,
  PublishModuleVersionSchema,
  type ModuleSchema,
} from "shared"
import { ModuleNotFoundError } from "./repositories/modules.js"
import { NoDraftVersionError } from "./repositories/module-versions.js"
import type { ModuleBuilderService } from "./services/module-builder.js"
import type { ModuleVersionsService } from "./services/module-versions.js"

const ModuleParamsSchema = z.object({ moduleId: z.string() })
const ListModulesQuerySchema = z.object({ q: z.string().optional() })
const ErrorResponseSchema = z.object({ message: z.string() })

function serializeVersion<
  T extends { schema: unknown; createdAt: Date; publishedAt: Date | null },
>(version: T) {
  return {
    ...version,
    // The jsonb column is untyped at the DB layer; the app is the only
    // writer and always writes the ModuleSchema shape.
    schema: version.schema as ModuleSchema,
    createdAt: version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
  }
}

// One plugin per capability (US-0.5), mirroring form-builder's routes.ts.
export function moduleBuilderPlugin(
  service: ModuleBuilderService,
  versionsService: ModuleVersionsService,
): FastifyPluginAsync {
  return async (app) => {
    const typed = app.withTypeProvider<ZodTypeProvider>()

    typed.get(
      "/api/modules",
      {
        schema: {
          querystring: ListModulesQuerySchema,
          response: { 200: ModuleListSchema },
        },
      },
      async (request) => {
        const rows = await service.listModules(request.query.q)
        return rows.map((row) => ({
          ...row,
          archivedAt: row.archivedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }))
      },
    )

    typed.post(
      "/api/modules",
      {
        schema: {
          body: CreateModuleSchema,
          response: { 201: ModuleSummarySchema },
        },
      },
      async (request, reply) => {
        const row = await service.createModule(request.body)
        return reply.code(201).send({
          ...row,
          archivedAt: row.archivedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })
      },
    )

    typed.post(
      "/api/modules/:moduleId/archive",
      {
        schema: {
          params: ModuleParamsSchema,
          response: { 200: ModuleSummarySchema, 404: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        try {
          const row = await service.archiveModule(request.params.moduleId)
          return reply.code(200).send({
            ...row,
            archivedAt: row.archivedAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
          })
        } catch (error) {
          if (error instanceof ModuleNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.post(
      "/api/modules/:moduleId/publish",
      {
        schema: {
          params: ModuleParamsSchema,
          body: PublishModuleVersionSchema,
          response: { 200: ModuleVersionSchema, 409: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.publishDraft(
            request.params.moduleId,
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
      "/api/modules/:moduleId/draft",
      {
        schema: {
          params: ModuleParamsSchema,
          body: ModuleSchemaSchema,
          response: { 200: ModuleVersionSchema, 404: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.editDraft(
            request.params.moduleId,
            request.body,
          )
          return reply.code(200).send(serializeVersion(version))
        } catch (error) {
          if (error instanceof ModuleNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/modules/:moduleId/draft",
      {
        schema: {
          params: ModuleParamsSchema,
          response: {
            200: ModuleVersionSchema.nullable(),
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.getDraft(
            request.params.moduleId,
          )
          return reply
            .code(200)
            .send(version ? serializeVersion(version) : null)
        } catch (error) {
          if (error instanceof ModuleNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/modules/:moduleId/active",
      {
        schema: {
          params: ModuleParamsSchema,
          response: {
            200: ModuleVersionSchema.nullable(),
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.getActiveVersion(
            request.params.moduleId,
          )
          return reply
            .code(200)
            .send(version ? serializeVersion(version) : null)
        } catch (error) {
          if (error instanceof ModuleNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )
  }
}
