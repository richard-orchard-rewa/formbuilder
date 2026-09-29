import type { AnchorContext, BindingCommitResult, BoundValues } from "shared"

// One commit of a session note's bound values to the Data Binding Service:
// which record, whose (null for the session itself), what the note opened
// with, what was sent, and what came back per binding.
export interface SessionTemplateSubmissionBindingRecord {
  submissionId: string
  participant: string | null
  anchor: AnchorContext | null
  baseline: BoundValues | null
  values: BoundValues
  results: Record<string, BindingCommitResult>
}

export interface SessionTemplateSubmissionBindingsRepository {
  record(entry: SessionTemplateSubmissionBindingRecord): Promise<void>
  list(submissionId: string): Promise<SessionTemplateSubmissionBindingRecord[]>
}
