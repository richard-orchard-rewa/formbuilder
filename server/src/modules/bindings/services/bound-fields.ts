import {
  isBoundField,
  type BindingCommitResult,
  type BoundValues,
  type Field,
  type SubmissionBindingContext,
} from "shared"
import type { BindingClient } from "../binding-client.js"
import { BindingServiceError } from "../binding-client.js"
import type { SubmissionBindingsRepository } from "../repositories/submission-bindings.js"

export type BindingResults = Record<string, BindingCommitResult>

// Sends a submission's data-bound values on to the Data Binding Service and
// records what happened. The submission itself is already saved by then --
// its raw JSON stays the record of what was captured (requirements §7) --
// so an unreachable DBS or a refused write is reported per field, never
// lost or allowed to fail the submission.
//
// Prototype simplification: this runs synchronously on submit. Before real
// use it becomes an outbox drained with retries (docs/proposals/databound-fields.md).
export class BoundFieldsService {
  constructor(
    private readonly client: BindingClient,
    private readonly repo: SubmissionBindingsRepository,
  ) {}

  async commit(
    submissionId: string,
    fields: Field[],
    data: Record<string, unknown>,
    context: SubmissionBindingContext | undefined,
  ): Promise<BindingResults | undefined> {
    const writable = fields
      .filter(isBoundField)
      .filter((field) => field.binding.access === "readWrite")
    if (writable.length === 0) return undefined

    const values: BoundValues = {}
    for (const field of writable) {
      const value = data[field.id]
      values[field.binding.key] = typeof value === "string" ? value : null
    }

    let results: BindingResults
    if (!context) {
      results = allWith(values, {
        status: "skipped",
        message: "No client was selected, so nothing was sent",
      })
    } else {
      try {
        results = (
          await this.client.commit({
            anchor: context.anchor,
            values,
            baseline: context.baseline,
          })
        ).results
      } catch (error) {
        if (!(error instanceof BindingServiceError)) throw error
        results = allWith(values, { status: "failed", message: error.message })
      }
    }

    await this.repo.record({
      submissionId,
      anchor: context?.anchor ?? null,
      baseline: context?.baseline ?? null,
      values,
      results,
    })
    return results
  }
}

function allWith(values: BoundValues, result: BindingCommitResult) {
  return Object.fromEntries(Object.keys(values).map((key) => [key, result]))
}
