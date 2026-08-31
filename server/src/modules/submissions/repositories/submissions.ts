export interface SubmissionRow {
  id: string
  formId: string
  formVersionId: string
  status: "draft" | "submitted"
  data: unknown
  submittedBy: string | null
  submittedAt: Date | null
}

export interface SubmissionSummaryRow {
  id: string
  status: "draft" | "submitted"
  formVersionNumber: number
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

export interface SubmissionEditRow {
  id: string
  submissionId: string
  previousData: unknown
  editedBy: string | null
  editedAt: Date
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

  // Overwrites a submitted submission's data in place and records the prior
  // data as an audit-trail row in the same operation (US-5.2), so the two
  // can never happen independently. Returns null if the row doesn't exist,
  // belongs to a different form, or is still a draft (edits apply only to
  // already-submitted submissions -- a draft is edited via saveDraft).
  edit(
    formId: string,
    submissionId: string,
    data: unknown,
    editedBy?: string | null,
  ): Promise<SubmissionRow | null>

  // The edit history for one submission, most recent first (US-5.2).
  listEdits(submissionId: string): Promise<SubmissionEditRow[]>
}
