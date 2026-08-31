export interface SubmissionRow {
  id: string
  formId: string
  formVersionId: string
  submittedBy: string | null
  submittedAt: Date
}

export interface SubmissionsRepository {
  // Records a completed submission against a specific form version, so it
  // always points at the exact schema it was captured against (US-1.3).
  create(
    formId: string,
    formVersionId: string,
    data: unknown,
    submittedBy?: string | null,
  ): Promise<SubmissionRow>
}
