export type ModuleVersionStatus = "draft" | "published" | "superseded"

export interface ModuleVersionRow {
  id: string
  moduleId: string
  version: number
  schema: unknown
  status: ModuleVersionStatus
  createdAt: Date
  publishedAt: Date | null
  publishedBy: string | null
}

// Thrown when a module has no draft version to publish, either because the
// module doesn't exist or its only draft was already published.
export class NoDraftVersionError extends Error {
  constructor(moduleId: string) {
    super(`No draft version found for module ${moduleId}`)
    this.name = "NoDraftVersionError"
  }
}

export interface ModuleVersionsRepository {
  // Publishes the module's current draft version: locks it as immutable,
  // assigns it the next version number, and supersedes whichever version
  // was previously active so only one stays active per module (US-7.3).
  publishDraft(
    moduleId: string,
    publishedBy?: string | null,
  ): Promise<ModuleVersionRow>

  // Applies a schema edit to the module's draft version. If the module has
  // no draft (its active version is published), a new draft is created
  // instead of mutating the published one, so anything already referencing
  // that version keeps pointing at the exact schema it was captured
  // against (US-7.3).
  editDraft(moduleId: string, schema: unknown): Promise<ModuleVersionRow>

  // Returns the module's current draft, or null if the module exists but
  // has no draft (its active version is published and untouched since).
  // Throws if the module itself doesn't exist (US-7.2).
  getDraft(moduleId: string): Promise<ModuleVersionRow | null>

  // Returns the module's currently active (published) version, or null if
  // nothing has been published yet. Throws if the module itself doesn't
  // exist.
  getActiveVersion(moduleId: string): Promise<ModuleVersionRow | null>
}
