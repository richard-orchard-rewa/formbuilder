export interface SubmissionRow {
  id: string
  formVersionId: string
  submittedAt: Date
}

export interface SubmissionsRepository {
  // Records a completed submission against a specific form version, so it
  // always points at the exact schema it was captured against (US-1.3).
  create(formVersionId: string, data: unknown): Promise<SubmissionRow>
}
