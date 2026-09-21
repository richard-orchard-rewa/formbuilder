export type SessionTemplateVersionStatus = "published" | "superseded"

// One module's snapshotted version, as stored in a version row's `modules`
// jsonb column -- just the two ids; names/version numbers/fields are
// resolved at read time (see SessionTemplateVersionsService).
export interface SessionTemplateModuleSnapshotInput {
  moduleId: string
  moduleVersionId: string
}

export interface SessionTemplateVersionRow {
  id: string
  sessionTemplateId: string
  version: number
  modules: unknown // SessionTemplateModuleSnapshotInput[], untyped at the DB layer
  status: SessionTemplateVersionStatus
  createdAt: Date
  publishedAt: Date
  publishedBy: string | null
}

export interface SessionTemplateVersionsRepository {
  // Snapshots the given module-version pairs as a new published version,
  // superseding whichever version was previously active (US-8.4) --
  // mirrors FormVersionsRepository.publishDraft's supersede-then-insert
  // shape, but there's no draft row to promote: this always inserts fresh.
  publish(
    sessionTemplateId: string,
    modules: SessionTemplateModuleSnapshotInput[],
    publishedBy?: string | null,
  ): Promise<SessionTemplateVersionRow>

  // The template's currently active (published) version, or null if
  // nothing has been published yet.
  getActiveVersion(
    sessionTemplateId: string,
  ): Promise<SessionTemplateVersionRow | null>

  // Every version of a template, most recently created first (US-8.7).
  listVersions(
    sessionTemplateId: string,
  ): Promise<SessionTemplateVersionRow[]>

  // One specific version by id (US-8.8), or null if it doesn't exist.
  getVersionById(versionId: string): Promise<SessionTemplateVersionRow | null>
}
