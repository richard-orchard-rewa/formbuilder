export interface SubmissionRow {
  id: string
  formId: string
  formVersionId: string
  status: "draft" | "submitted"
  data: unknown
  submittedBy: string | null
  submittedAt: Date | null
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
}
