import type { AnchorContext, BoundValues } from "shared"
import type { BindingResults } from "../services/bound-fields.js"

// One attempt to send a submission's data-bound values to the Data Binding
// Service: which record, what the form opened with, what was sent, and what
// came back per binding.
export interface SubmissionBindingRecord {
  submissionId: string
  anchor: AnchorContext | null
  baseline: BoundValues | null
  values: BoundValues
  results: BindingResults
}

export interface SubmissionBindingsRepository {
  record(entry: SubmissionBindingRecord): Promise<void>
}
