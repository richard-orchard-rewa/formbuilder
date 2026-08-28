import type { Db } from "./db/client.js"
import { DrizzleFormsRepository } from "./modules/form-builder/repositories/forms.drizzle.js"
import { DrizzleFormVersionsRepository } from "./modules/form-builder/repositories/form-versions.drizzle.js"
import { FormBuilderService } from "./modules/form-builder/services/form-builder.js"
import { FormVersionsService } from "./modules/form-builder/services/form-versions.js"

export interface AppDeps {
  formBuilderService: FormBuilderService
  formVersionsService: FormVersionsService
}

export function buildDeps(db: Db): AppDeps {
  return {
    formBuilderService: new FormBuilderService(new DrizzleFormsRepository(db)),
    formVersionsService: new FormVersionsService(
      new DrizzleFormVersionsRepository(db),
    ),
  }
}
