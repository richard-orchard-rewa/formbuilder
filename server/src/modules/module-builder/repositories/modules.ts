export interface ModuleRow {
  id: string
  name: string
  description: string | null
  archivedAt: Date | null
  createdAt: Date
}

// list()'s row additionally says whether the module has ever been
// published -- session templates (Epic US-8) can only reference a
// published module, so its picker needs this to filter (US-8.2).
export interface ModuleListRow extends ModuleRow {
  hasPublishedVersion: boolean
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
  list(query?: string): Promise<ModuleListRow[]>

  create(input: CreateModuleInput): Promise<ModuleRow>

  // Hides a module from `list()` without deleting it or affecting anything
  // that already references it (US-7.4). Throws if the module doesn't
  // exist.
  archive(moduleId: string): Promise<ModuleRow>

  // Looks up one module by id regardless of archived state -- used by
  // session templates (Epic US-8) to resolve a module's name for display,
  // even for a module that's since been archived.
  getById(moduleId: string): Promise<ModuleRow | null>
}
