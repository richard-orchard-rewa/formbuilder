import type {
  CreateModuleInput,
  ModulesRepository,
} from "../repositories/modules.js"

export class ModuleBuilderService {
  constructor(private readonly repo: ModulesRepository) {}

  listModules(query?: string) {
    return this.repo.list(query)
  }

  createModule(input: CreateModuleInput) {
    return this.repo.create(input)
  }

  archiveModule(moduleId: string) {
    return this.repo.archive(moduleId)
  }

  getModule(moduleId: string) {
    return this.repo.getById(moduleId)
  }
}
