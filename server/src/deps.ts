import type { Db } from "./db/client.js"
import { DrizzleFormsRepository } from "./modules/form-builder/repositories/forms.drizzle.js"
import { DrizzleFormVersionsRepository } from "./modules/form-builder/repositories/form-versions.drizzle.js"
import { FormBuilderService } from "./modules/form-builder/services/form-builder.js"
import { FormVersionsService } from "./modules/form-builder/services/form-versions.js"
import { DrizzleModulesRepository } from "./modules/module-builder/repositories/modules.drizzle.js"
import { DrizzleModuleVersionsRepository } from "./modules/module-builder/repositories/module-versions.drizzle.js"
import { ModuleBuilderService } from "./modules/module-builder/services/module-builder.js"
import { ModuleVersionsService } from "./modules/module-builder/services/module-versions.js"
import { DrizzleSessionTemplatesRepository } from "./modules/session-templates/repositories/session-templates.drizzle.js"
import { DrizzleSessionTemplateSubmissionsRepository } from "./modules/session-templates/repositories/session-template-submissions.drizzle.js"
import { DrizzleSessionTemplateVersionsRepository } from "./modules/session-templates/repositories/session-template-versions.drizzle.js"
import { SessionTemplatesService } from "./modules/session-templates/services/session-templates.js"
import { SessionTemplateSubmissionsService } from "./modules/session-templates/services/session-template-submissions.js"
import { SessionTemplateVersionsService } from "./modules/session-templates/services/session-template-versions.js"
import { DrizzleSubmissionsRepository } from "./modules/submissions/repositories/submissions.drizzle.js"
import { SubmissionsService } from "./modules/submissions/services/submissions.js"

export interface AppDeps {
  formBuilderService: FormBuilderService
  formVersionsService: FormVersionsService
  moduleBuilderService: ModuleBuilderService
  moduleVersionsService: ModuleVersionsService
  sessionTemplatesService: SessionTemplatesService
  sessionTemplateVersionsService: SessionTemplateVersionsService
  sessionTemplateSubmissionsService: SessionTemplateSubmissionsService
  submissionsService: SubmissionsService
}

export function buildDeps(db: Db): AppDeps {
  const formVersionsService = new FormVersionsService(
    new DrizzleFormVersionsRepository(db),
  )
  const moduleBuilderService = new ModuleBuilderService(
    new DrizzleModulesRepository(db),
  )
  const moduleVersionsService = new ModuleVersionsService(
    new DrizzleModuleVersionsRepository(db),
  )
  const sessionTemplatesService = new SessionTemplatesService(
    new DrizzleSessionTemplatesRepository(db),
    moduleVersionsService,
  )
  const sessionTemplateVersionsService = new SessionTemplateVersionsService(
    new DrizzleSessionTemplateVersionsRepository(db),
    sessionTemplatesService,
    moduleBuilderService,
    moduleVersionsService,
  )
  return {
    formBuilderService: new FormBuilderService(new DrizzleFormsRepository(db)),
    formVersionsService,
    moduleBuilderService,
    moduleVersionsService,
    sessionTemplatesService,
    sessionTemplateVersionsService,
    sessionTemplateSubmissionsService: new SessionTemplateSubmissionsService(
      sessionTemplateVersionsService,
      new DrizzleSessionTemplateSubmissionsRepository(db),
    ),
    submissionsService: new SubmissionsService(
      formVersionsService,
      new DrizzleSubmissionsRepository(db),
    ),
  }
}
