import Fastify from "fastify"
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod"
import type { Logger } from "pino"
import { bindingsPlugin } from "./modules/bindings/routes.js"
import { formBuilderPlugin } from "./modules/form-builder/routes.js"
import { moduleBuilderPlugin } from "./modules/module-builder/routes.js"
import { sessionTemplatesPlugin } from "./modules/session-templates/routes.js"
import { submissionsPlugin } from "./modules/submissions/routes.js"
import type { AppDeps } from "./deps.js"

export function buildApp(deps: AppDeps, logger: Logger) {
  const app = Fastify({ loggerInstance: logger })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(
    formBuilderPlugin(deps.formBuilderService, deps.formVersionsService),
  )
  app.register(
    moduleBuilderPlugin(deps.moduleBuilderService, deps.moduleVersionsService),
  )
  app.register(
    sessionTemplatesPlugin(
      deps.sessionTemplatesService,
      deps.sessionTemplateVersionsService,
      deps.sessionTemplateSubmissionsService,
    ),
  )
  app.register(submissionsPlugin(deps.submissionsService))
  app.register(bindingsPlugin(deps.bindingClient))

  return app
}
