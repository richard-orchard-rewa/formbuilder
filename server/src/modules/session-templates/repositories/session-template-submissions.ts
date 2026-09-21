export interface SessionTemplateSubmissionRow {
  id: string
  sessionTemplateId: string
  sessionTemplateVersionId: string
  data: unknown
  submittedBy: string | null
  submittedAt: Date
}

export interface CreateSessionTemplateSubmissionInput {
  sessionTemplateId: string
  sessionTemplateVersionId: string
  data: Record<string, unknown>
  submittedBy?: string | null
}

// A per-template list an admin can review (mirrors SubmissionSummaryRow):
// which version it was captured against, and when.
export interface SessionTemplateSubmissionSummaryRow {
  id: string
  sessionTemplateVersionNumber: number
  submittedBy: string | null
  submittedAt: Date
}

export interface SessionTemplateSubmissionsRepository {
  create(
    input: CreateSessionTemplateSubmissionInput,
  ): Promise<SessionTemplateSubmissionRow>

  // Every submission captured against this template, most recent first.
  list(sessionTemplateId: string): Promise<SessionTemplateSubmissionSummaryRow[]>

  // One submission, scoped to this template so a submission id from a
  // different template can never be fetched through it. Null if it
  // doesn't exist (or belongs to a different template).
  getById(
    sessionTemplateId: string,
    submissionId: string,
  ): Promise<SessionTemplateSubmissionRow | null>
}
