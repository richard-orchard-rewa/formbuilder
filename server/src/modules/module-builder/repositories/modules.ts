export interface ModuleRow {
  id: string
  name: string
  description: string | null
  archivedAt: Date | null
  createdAt: Date
}

export interface CreateModuleInput {
  name: string
  description?: string | null
}

export class ModuleNotFoundError extends Error {
  constructor(moduleId: string) {
    super(`No module found with id ${moduleId}`)
    this.name = "ModuleNotFoundError"
  }
}

export interface ModulesRepository {
  // Lists non-archived modules (US-7.4), optionally narrowed by a
  // substring, case-insensitive search over `name`.
  list(query?: string): Promise<ModuleRow[]>

  create(input: CreateModuleInput): Promise<ModuleRow>

  // Hides a module from `list()` without deleting it or affecting anything
  // that already references it (US-7.4). Throws if the module doesn't
  // exist.
  archive(moduleId: string): Promise<ModuleRow>
}
