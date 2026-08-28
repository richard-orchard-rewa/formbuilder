import Fastify from "fastify"
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod"
import type { Logger } from "pino"
import { formBuilderPlugin } from "./modules/form-builder/routes.js"
import { submissionsPlugin } from "./modules/submissions/routes.js"
import type { AppDeps } from "./deps.js"

export function buildApp(deps: AppDeps, logger: Logger) {
  const app = Fastify({ loggerInstance: logger })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(
    formBuilderPlugin(deps.formBuilderService, deps.formVersionsService),
  )
  app.register(submissionsPlugin(deps.submissionsService))

  return app
}
