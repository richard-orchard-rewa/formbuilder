import type { Db } from "../../../db/client.js"
import { submissions } from "../../../db/schema.js"
import type { SubmissionRow, SubmissionsRepository } from "./submissions.js"

export class DrizzleSubmissionsRepository implements SubmissionsRepository {
  constructor(private readonly db: Db) {}

  async create(
    formId: string,
    formVersionId: string,
    data: unknown,
    submittedBy?: string | null,
  ): Promise<SubmissionRow> {
    const [row] = await this.db
      .insert(submissions)
      .values({
        formId,
        formVersionId,
        data,
        submittedBy: submittedBy ?? null,
        status: "submitted",
        submittedAt: new Date(),
      })
      .returning({
        id: submissions.id,
        formId: submissions.formId,
        formVersionId: submissions.formVersionId,
        submittedBy: submissions.submittedBy,
        submittedAt: submissions.submittedAt,
      })
    // submittedAt is nullable at the column level (a submission can be
    // saved as a draft first), but this insert always sets it.
    return { ...row, submittedAt: row.submittedAt! }
  }
}
