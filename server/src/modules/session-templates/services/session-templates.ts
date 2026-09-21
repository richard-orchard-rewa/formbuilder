import type { Field, ModuleSchema } from "shared"
import type { ModuleVersionsService } from "../../module-builder/services/module-versions.js"
import type {
  CreateSessionTemplateInput,
  SessionTemplatesRepository,
} from "../repositories/session-templates.js"

// Thrown when a session template's composition would include a module id
// twice (US-8.2: one instance per template).
export class DuplicateModuleError extends Error {
  constructor(moduleId: string) {
    super(`Module ${moduleId} is already in this session template`)
    this.name = "DuplicateModuleError"
  }
}

// Thrown when a module added to a session template has no published
// version yet (US-8.2: only published modules can be referenced).
export class ModuleNotPublishedError extends Error {
  constructor(moduleId: string) {
    super(`Module ${moduleId} has no published version`)
    this.name = "ModuleNotPublishedError"
  }
}

export class SessionTemplatesService {
  constructor(
    private readonly repo: SessionTemplatesRepository,
    private readonly moduleVersions: ModuleVersionsService,
  ) {}

  listSessionTemplates(query?: string) {
    return this.repo.list(query)
  }

  createSessionTemplate(input: CreateSessionTemplateInput) {
    return this.repo.create(input)
  }

  archiveSessionTemplate(sessionTemplateId: string) {
    return this.repo.archive(sessionTemplateId)
  }

  getComposition(sessionTemplateId: string) {
    return this.repo.getComposition(sessionTemplateId)
  }

  // Replaces the whole composition (US-8.2), validating every module id is
  // real, published, and appears at most once before persisting any of it.
  async setComposition(sessionTemplateId: string, moduleIds: string[]) {
    const seen = new Set<string>()
    for (const moduleId of moduleIds) {
      if (seen.has(moduleId)) throw new DuplicateModuleError(moduleId)
      seen.add(moduleId)
      const active = await this.moduleVersions.getActiveVersion(moduleId)
      if (!active) throw new ModuleNotPublishedError(moduleId)
    }
    return this.repo.setComposition(sessionTemplateId, moduleIds)
  }

  // US-8.3: resolves the current composition to each referenced module's
  // *current* published version, combined in order -- this is where the
  // "live reference" decision in docs/proposals/modules-and-session-
  // templates.md becomes visible: republishing a module changes this
  // without touching the template.
  async previewSchema(sessionTemplateId: string): Promise<{ fields: Field[] }> {
    const composition = await this.repo.getComposition(sessionTemplateId)
    const fields: Field[] = []
    for (const item of composition) {
      const active = await this.moduleVersions.getActiveVersion(item.moduleId)
      // Shouldn't happen -- setComposition only ever admits published
      // modules -- but a module can't be un-published, so this is just
      // defensive rather than a real state to design around.
      if (!active) continue
      const schema = active.schema as ModuleSchema
      fields.push(...schema.fields)
    }
    return { fields }
  }
}
