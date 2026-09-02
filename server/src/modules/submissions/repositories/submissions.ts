export interface SubmissionRow {
  id: string
  formId: string
  formVersionId: string
  status: "draft" | "submitted"
  data: unknown
  legacyData: unknown
  migratedFromSubmissionId: string | null
  submittedBy: string | null
  submittedAt: Date | null
}

// Input to createMigrated (US-6.1): everything needed to record a
// submission produced by migrating another one onto a newer version,
// rather than being captured directly.
export interface CreateMigratedInput {
  formId: string
  formVersionId: string
  data: unknown
  legacyData: unknown | null
  status: "draft" | "submitted"
  migratedFromSubmissionId: string
  migratedBy?: string | null
}

export interface SubmissionSummaryRow {
  id: string
  status: "draft" | "submitted"
  formVersionNumber: number
  migratedFromSubmissionId: string | null
  createdAt: Date
  submittedAt: Date | null
}

// Filters for listByForm (US-5.3). `from`/`to` bound `createdAt`
// (inclusive) rather than `submittedAt`, so a date-range filter still
// matches drafts. All optional -- an unfiltered call lists everything.
export interface SubmissionListFilters {
  from?: Date
  to?: Date
  formVersionNumber?: number
}

export interface SubmissionDetailRow extends SubmissionRow {
  // The version's own number and schema at the time this submission was
  // captured, joined in so it renders correctly even if the form has
  // since been republished with a different structure (US-5.1).
  formVersionNumber: number
  schema: unknown
}

// One version of a submission across its lifetime (US-6.1, US-6.2).
// `activeTo` is null for the current, still-live version.
export interface SubmissionHistoryRow {
  id: string
  submissionId: string
  formVersionId: string
  data: unknown
  legacyData: unknown
  status: "draft" | "submitted"
  submittedBy: string | null
  migratedFromSubmissionId: string | null
  editedBy: string | null
  activeFrom: Date
  activeTo: Date | null
}

export interface SubmissionsRepository {
  // Records a completed submission directly (no prior draft) against a
  // specific form version, so it always points at the exact schema it was
  // captured against (US-1.3).
  create(
    formId: string,
    formVersionId: string,
    data: unknown,
    submittedBy?: string | null,
  ): Promise<SubmissionRow>

  // Creates or overwrites a draft (US-4.3): with no `submissionId`, inserts
  // a new draft row; with one, overwrites that row's data in place --
  // unless it no longer exists, belongs to a different form, or has
  // already been finalized, in which case a fresh draft is inserted
  // instead (a stale client-side reference shouldn't block saving).
  // Never validated against required fields -- that's the point of a
  // draft.
  saveDraft(
    formId: string,
    formVersionId: string,
    data: unknown,
    submissionId?: string,
  ): Promise<SubmissionRow>

  // Fetches a draft by id, scoped to `formId`, so a respondent can resume
  // filling it out. Returns null if it doesn't exist, belongs to a
  // different form, or has already been finalized (US-4.3).
  getDraft(formId: string, submissionId: string): Promise<SubmissionRow | null>

  // Finalizes an existing draft in place: updates its data/version/status
  // to "submitted" and stamps submittedAt. Returns null (rather than
  // inserting) if the row doesn't exist, belongs to a different form, or
  // was already finalized, so the caller can decide how to handle a stale
  // reference (US-4.3).
  finalizeDraft(
    formId: string,
    submissionId: string,
    formVersionId: string,
    data: unknown,
    submittedBy?: string | null,
  ): Promise<SubmissionRow | null>

  // Lists a form's submissions (draft and submitted) for review/reporting,
  // most recent first, together with the version each targets (US-5.1,
  // US-5.3). Narrowed by `filters` when given -- an admin filtering by
  // date range or schema version.
  listByForm(
    formId: string,
    filters?: SubmissionListFilters,
  ): Promise<SubmissionSummaryRow[]>

  // Fetches one submission together with the version it targets, scoped
  // to `formId` so a submission id from another form can't be looked up
  // (US-5.1). Returns null if no match.
  getById(
    formId: string,
    submissionId: string,
  ): Promise<SubmissionDetailRow | null>

  // Overwrites a submitted submission's data in place (US-5.2). The prior
  // row state is archived as an audit-trail row by a database trigger as
  // part of the same UPDATE (US-6.1), so the two can never happen
  // independently or race each other. Returns null if the row doesn't
  // exist, belongs to a different form, or is still a draft (edits apply
  // only to already-submitted submissions -- a draft is edited via
  // saveDraft).
  edit(
    formId: string,
    submissionId: string,
    data: unknown,
    editedBy?: string | null,
  ): Promise<SubmissionRow | null>

  // Every version of one submission across its lifetime, oldest first,
  // ending with the current still-live one (`activeTo: null`) (US-5.2,
  // US-6.1, US-6.2) -- so a point-in-time "what did this look like on date
  // X" query can be answered by finding the entry whose
  // [activeFrom, activeTo) window contains X.
  listVersions(submissionId: string): Promise<SubmissionHistoryRow[]>

  // Records a submission produced by migrating another one onto a newer
  // version (US-6.1). The source submission is never touched -- this always
  // inserts a new row, linked back via `migratedFromSubmissionId`.
  createMigrated(input: CreateMigratedInput): Promise<SubmissionRow>

  // Finds the submission (if any) already migrated from `submissionId` onto
  // `formVersionId`, so a migration can be re-run safely without creating
  // duplicates (US-6.1).
  findMigratedCopy(
    submissionId: string,
    formVersionId: string,
  ): Promise<SubmissionRow | null>

  // The ids of every submitted (not draft) submission captured against one
  // specific version, so a bulk migration knows what to migrate (US-6.1).
  listSubmittedByVersion(
    formId: string,
    formVersionId: string,
  ): Promise<{ id: string }[]>
}
