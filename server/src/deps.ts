import type { Db } from "./db/client.js"
import { DrizzleFormsRepository } from "./modules/form-builder/repositories/forms.drizzle.js"
import { DrizzleFormVersionsRepository } from "./modules/form-builder/repositories/form-versions.drizzle.js"
import { FormBuilderService } from "./modules/form-builder/services/form-builder.js"
import { FormVersionsService } from "./modules/form-builder/services/form-versions.js"
import { DrizzleSubmissionsRepository } from "./modules/submissions/repositories/submissions.drizzle.js"
import { SubmissionsService } from "./modules/submissions/services/submissions.js"

export interface AppDeps {
  formBuilderService: FormBuilderService
  formVersionsService: FormVersionsService
  submissionsService: SubmissionsService
}

export function buildDeps(db: Db): AppDeps {
  const formVersionsService = new FormVersionsService(
    new DrizzleFormVersionsRepository(db),
  )
  return {
    formBuilderService: new FormBuilderService(new DrizzleFormsRepository(db)),
    formVersionsService,
    submissionsService: new SubmissionsService(
      formVersionsService,
      new DrizzleSubmissionsRepository(db),
    ),
  }
}
