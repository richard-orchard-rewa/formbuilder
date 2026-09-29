import { asc, eq } from "drizzle-orm"
import type { AnchorContext, BindingCommitResult, BoundValues } from "shared"
import type { Db } from "../../../db/client.js"
import { sessionTemplateSubmissionBindings } from "../../../db/schema.js"
import type {
  SessionTemplateSubmissionBindingRecord,
  SessionTemplateSubmissionBindingsRepository,
} from "./session-template-submission-bindings.js"

export class DrizzleSessionTemplateSubmissionBindingsRepository
  implements SessionTemplateSubmissionBindingsRepository
{
  constructor(private readonly db: Db) {}

  async record(entry: SessionTemplateSubmissionBindingRecord): Promise<void> {
    await this.db.insert(sessionTemplateSubmissionBindings).values(entry)
  }

  async list(submissionId: string): Promise<SessionTemplateSubmissionBindingRecord[]> {
    const rows = await this.db
      .select()
      .from(sessionTemplateSubmissionBindings)
      .where(eq(sessionTemplateSubmissionBindings.submissionId, submissionId))
      .orderBy(asc(sessionTemplateSubmissionBindings.createdAt))
    return rows.map((row) => ({
      submissionId: row.submissionId,
      participant: row.participant,
      anchor: row.anchor as AnchorContext | null,
      baseline: row.baseline as BoundValues | null,
      values: row.values as BoundValues,
      results: row.results as Record<string, BindingCommitResult>,
    }))
  }
}
