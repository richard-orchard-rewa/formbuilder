import type { ModuleVersionsRepository } from "../repositories/module-versions.js"

export class ModuleVersionsService {
  constructor(private readonly repo: ModuleVersionsRepository) {}

  publishDraft(moduleId: string, publishedBy?: string | null) {
    return this.repo.publishDraft(moduleId, publishedBy)
  }

  editDraft(moduleId: string, schema: unknown) {
    return this.repo.editDraft(moduleId, schema)
  }

  getDraft(moduleId: string) {
    return this.repo.getDraft(moduleId)
  }

  getActiveVersion(moduleId: string) {
    return this.repo.getActiveVersion(moduleId)
  }
}
