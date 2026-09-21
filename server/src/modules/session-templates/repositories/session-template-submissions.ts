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

export interface SessionTemplateSubmissionsRepository {
  create(
    input: CreateSessionTemplateSubmissionInput,
  ): Promise<SessionTemplateSubmissionRow>
}
