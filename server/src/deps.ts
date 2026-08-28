import type { Db } from "./db/client.js"
import { DrizzleFormsRepository } from "./modules/form-builder/repositories/forms.drizzle.js"
import { FormBuilderService } from "./modules/form-builder/services/form-builder.js"

export interface AppDeps {
  formBuilderService: FormBuilderService
}

export function buildDeps(db: Db): AppDeps {
  return {
    formBuilderService: new FormBuilderService(new DrizzleFormsRepository(db)),
  }
}
