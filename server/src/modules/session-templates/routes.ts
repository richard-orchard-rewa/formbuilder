import type { FastifyPluginAsync } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"
import {
  CreateSessionTemplateSchema,
  PublishSessionTemplateSchema,
  SessionTemplateListSchema,
  SessionTemplateModulesSchema,
  SessionTemplateSchemaSchema,
  SessionTemplateSubmissionSchema,
  SessionTemplateSummarySchema,
  SessionTemplateVersionHistorySchema,
  SessionTemplateVersionSchema,
  SetSessionTemplateModulesSchema,
  SubmissionValidationErrorSchema,
  SubmitSessionTemplateSchema,
} from "shared"
import { SessionTemplateNotFoundError } from "./repositories/session-templates.js"
import {
  DuplicateModuleError,
  ModuleNotPublishedError,
  type SessionTemplatesService,
} from "./services/session-templates.js"
import {
  EmptyCompositionError,
  type ResolvedSessionTemplateVersion,
  type SessionTemplateVersionsService,
} from "./services/session-template-versions.js"
import {
  MissingRequiredFieldsError,
  NoActiveVersionError,
  type SessionTemplateSubmissionsService,
} from "./services/session-template-submissions.js"
import type { SessionTemplateVersionRow } from "./repositories/session-template-versions.js"
import type { SessionTemplateSubmissionRow } from "./repositories/session-template-submissions.js"

const SessionTemplateParamsSchema = z.object({ sessionTemplateId: z.string() })
const VersionParamsSchema = SessionTemplateParamsSchema.extend({
  versionId: z.string(),
})
const ListQuerySchema = z.object({ q: z.string().optional() })
const ErrorResponseSchema = z.object({ message: z.string() })

function serializeTemplate<
  T extends { archivedAt: Date | null; createdAt: Date },
>(row: T) {
  return {
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

function serializeVersion(version: ResolvedSessionTemplateVersion) {
  return {
    id: version.id,
    sessionTemplateId: version.sessionTemplateId,
    version: version.version,
    status: version.status,
    modules: version.modules,
    schema: { fields: version.fields },
    createdAt: version.createdAt.toISOString(),
    publishedAt: version.publishedAt.toISOString(),
    publishedBy: version.publishedBy,
  }
}

// "published" is the DB's name for the single currently-active version;
// the version-history view (US-8.7) speaks in "active" instead, mirroring
// form-builder's routes.ts.
function toHistoryStatus(status: SessionTemplateVersionRow["status"]) {
  return status === "published" ? "active" : status
}

function serializeSubmission(row: SessionTemplateSubmissionRow) {
  return {
    ...row,
    data: row.data as Record<string, unknown>,
    submittedAt: row.submittedAt.toISOString(),
  }
}

// One plugin per capability (US-0.5), mirroring form-builder's/module-
// builder's routes.ts.
export function sessionTemplatesPlugin(
  service: SessionTemplatesService,
  versionsService: SessionTemplateVersionsService,
  submissionsService: SessionTemplateSubmissionsService,
): FastifyPluginAsync {
  return async (app) => {
    const typed = app.withTypeProvider<ZodTypeProvider>()

    typed.get(
      "/api/session-templates",
      {
        schema: {
          querystring: ListQuerySchema,
          response: { 200: SessionTemplateListSchema },
        },
      },
      async (request) => {
        const rows = await service.listSessionTemplates(request.query.q)
        return rows.map(serializeTemplate)
      },
    )

    typed.post(
      "/api/session-templates",
      {
        schema: {
          body: CreateSessionTemplateSchema,
          response: { 201: SessionTemplateSummarySchema },
        },
      },
      async (request, reply) => {
        const row = await service.createSessionTemplate(request.body)
        return reply.code(201).send(serializeTemplate(row))
      },
    )

    typed.post(
      "/api/session-templates/:sessionTemplateId/archive",
      {
        schema: {
          params: SessionTemplateParamsSchema,
          response: { 200: SessionTemplateSummarySchema, 404: ErrorResponseSchema },
        },
      },
      async (request, reply) => {
        try {
          const row = await service.archiveSessionTemplate(
            request.params.sessionTemplateId,
          )
          return reply.code(200).send(serializeTemplate(row))
        } catch (error) {
          if (error instanceof SessionTemplateNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/session-templates/:sessionTemplateId/modules",
      {
        schema: {
          params: SessionTemplateParamsSchema,
          response: {
            200: SessionTemplateModulesSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const composition = await service.getComposition(
            request.params.sessionTemplateId,
          )
          return reply
            .code(200)
            .send(composition.map(({ moduleId, name }) => ({ moduleId, name })))
        } catch (error) {
          if (error instanceof SessionTemplateNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.put(
      "/api/session-templates/:sessionTemplateId/modules",
      {
        schema: {
          params: SessionTemplateParamsSchema,
          body: SetSessionTemplateModulesSchema,
          response: {
            200: SessionTemplateModulesSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const composition = await service.setComposition(
            request.params.sessionTemplateId,
            request.body.moduleIds,
          )
          return reply
            .code(200)
            .send(composition.map(({ moduleId, name }) => ({ moduleId, name })))
        } catch (error) {
          if (error instanceof SessionTemplateNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          if (
            error instanceof DuplicateModuleError ||
            error instanceof ModuleNotPublishedError
          ) {
            return reply.code(400).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/session-templates/:sessionTemplateId/preview",
      {
        schema: {
          params: SessionTemplateParamsSchema,
          response: {
            200: SessionTemplateSchemaSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          return reply
            .code(200)
            .send(await service.previewSchema(request.params.sessionTemplateId))
        } catch (error) {
          if (error instanceof SessionTemplateNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.post(
      "/api/session-templates/:sessionTemplateId/publish",
      {
        schema: {
          params: SessionTemplateParamsSchema,
          body: PublishSessionTemplateSchema,
          response: {
            200: SessionTemplateVersionSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const version = await versionsService.publish(
            request.params.sessionTemplateId,
            request.body.publishedBy,
          )
          return reply.code(200).send(serializeVersion(version))
        } catch (error) {
          if (error instanceof SessionTemplateNotFoundError) {
            return reply.code(404).send({ message: error.message })
          }
          if (
            error instanceof EmptyCompositionError ||
            error instanceof ModuleNotPublishedError
          ) {
            return reply.code(409).send({ message: error.message })
          }
          throw error
        }
      },
    )

    typed.get(
      "/api/session-templates/:sessionTemplateId/active",
      {
        schema: {
          params: SessionTemplateParamsSchema,
          response: { 200: SessionTemplateVersionSchema.nullable() },
        },
      },
      async (request, reply) => {
        const version = await versionsService.getActiveVersion(
          request.params.sessionTemplateId,
        )
        return reply.code(200).send(version ? serializeVersion(version) : null)
      },
    )

    typed.get(
      "/api/session-templates/:sessionTemplateId/versions",
      {
        schema: {
          params: SessionTemplateParamsSchema,
          response: { 200: SessionTemplateVersionHistorySchema },
        },
      },
      async (request) => {
        const versions = await versionsService.listVersions(
          request.params.sessionTemplateId,
        )
        return versions.map((version) => ({
          id: version.id,
          version: version.version,
          status: toHistoryStatus(version.status),
          publishedAt: version.publishedAt.toISOString(),
          publishedBy: version.publishedBy,
        }))
      },
    )

    typed.get(
      "/api/session-templates/:sessionTemplateId/versions/:versionId",
      {
        schema: {
          params: VersionParamsSchema,
          response: {
            200: SessionTemplateVersionSchema.nullable(),
          },
        },
      },
      async (request, reply) => {
        const version = await versionsService.getVersionById(
          request.params.versionId,
        )
        return reply.code(200).send(version ? serializeVersion(version) : null)
      },
    )

    typed.post(
      "/api/session-templates/:sessionTemplateId/submissions",
      {
        schema: {
          params: SessionTemplateParamsSchema,
          body: SubmitSessionTemplateSchema,
          response: {
            201: SessionTemplateSubmissionSchema,
            400: SubmissionValidationErrorSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const submission = await submissionsService.submit(
            request.params.sessionTemplateId,
            request.body.data,
            request.body.submittedBy,
          )
          return reply.code(201).send(serializeSubmission(submission))
        } catch (error) {
          if (error instanceof NoActiveVersionError) {
            return reply.code(404).send({ message: error.message })
          }
          if (error instanceof MissingRequiredFieldsError) {
            return reply.code(400).send({
              message: "Some required fields are missing",
              missingFieldIds: error.missingFieldIds,
            })
          }
          throw error
        }
      },
    )
  }
}
