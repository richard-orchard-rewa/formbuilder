import type { Field, ModuleSchema } from "shared"
import type { ModuleBuilderService } from "../../module-builder/services/module-builder.js"
import type { ModuleVersionsService } from "../../module-builder/services/module-versions.js"
import type {
  SessionTemplateModuleSnapshotInput,
  SessionTemplateVersionRow,
  SessionTemplateVersionsRepository,
} from "../repositories/session-template-versions.js"
import { ModuleNotPublishedError } from "./session-templates.js"
import type { SessionTemplatesService } from "./session-templates.js"

// Thrown when a session template's current composition is empty -- there's
// nothing to snapshot into a version (US-8.4).
export class EmptyCompositionError extends Error {
  constructor(sessionTemplateId: string) {
    super(`Session template ${sessionTemplateId} has no modules to publish`)
    this.name = "EmptyCompositionError"
  }
}

// A stored version's snapshot resolved back into display-ready shape:
// each module's name and version number, plus the combined fields those
// versions' schemas produce.
export interface ResolvedSessionTemplateVersion {
  id: string
  sessionTemplateId: string
  version: number
  status: "published" | "superseded"
  createdAt: Date
  publishedAt: Date
  publishedBy: string | null
  modules: Array<{
    moduleId: string
    moduleName: string
    moduleVersionId: string
    moduleVersionNumber: number
  }>
  fields: Field[]
}

export class SessionTemplateVersionsService {
  constructor(
    private readonly repo: SessionTemplateVersionsRepository,
    private readonly sessionTemplates: SessionTemplatesService,
    private readonly modules: ModuleBuilderService,
    private readonly moduleVersions: ModuleVersionsService,
  ) {}

  async publish(
    sessionTemplateId: string,
    publishedBy?: string | null,
  ): Promise<ResolvedSessionTemplateVersion> {
    const composition = await this.sessionTemplates.getComposition(
      sessionTemplateId,
    )
    if (composition.length === 0) {
      throw new EmptyCompositionError(sessionTemplateId)
    }

    const snapshot: SessionTemplateModuleSnapshotInput[] = []
    for (const item of composition) {
      const active = await this.moduleVersions.getActiveVersion(item.moduleId)
      // Shouldn't happen -- a module can't be un-published once in a
      // template's composition -- but guard rather than snapshot a null.
      if (!active) throw new ModuleNotPublishedError(item.moduleId)
      snapshot.push({ moduleId: item.moduleId, moduleVersionId: active.id })
    }

    const row = await this.repo.publish(sessionTemplateId, snapshot, publishedBy)
    return this.resolve(row)
  }

  async getActiveVersion(
    sessionTemplateId: string,
  ): Promise<ResolvedSessionTemplateVersion | null> {
    const row = await this.repo.getActiveVersion(sessionTemplateId)
    return row ? this.resolve(row) : null
  }

  // Raw rows are enough for the history list (US-8.7) -- it shows only
  // version/status/publishedAt/publishedBy, none of which need resolving.
  listVersions(sessionTemplateId: string) {
    return this.repo.listVersions(sessionTemplateId)
  }

  async getVersionById(
    versionId: string,
  ): Promise<ResolvedSessionTemplateVersion | null> {
    const row = await this.repo.getVersionById(versionId)
    return row ? this.resolve(row) : null
  }

  private async resolve(
    row: SessionTemplateVersionRow,
  ): Promise<ResolvedSessionTemplateVersion> {
    const snapshot = row.modules as SessionTemplateModuleSnapshotInput[]
    const modules: ResolvedSessionTemplateVersion["modules"] = []
    const fields: Field[] = []

    for (const entry of snapshot) {
      const [moduleVersion, mod] = await Promise.all([
        this.moduleVersions.getVersionById(entry.moduleVersionId),
        this.modules.getModule(entry.moduleId),
      ])
      // Neither modules nor their versions are ever hard-deleted (only
      // archived), so this should never be null in practice.
      if (!moduleVersion || !mod) continue
      modules.push({
        moduleId: entry.moduleId,
        moduleName: mod.name,
        moduleVersionId: entry.moduleVersionId,
        moduleVersionNumber: moduleVersion.version,
      })
      const schema = moduleVersion.schema as ModuleSchema
      fields.push(...schema.fields)
    }

    return {
      id: row.id,
      sessionTemplateId: row.sessionTemplateId,
      version: row.version,
      status: row.status,
      createdAt: row.createdAt,
      publishedAt: row.publishedAt,
      publishedBy: row.publishedBy,
      modules,
      fields,
    }
  }
}
