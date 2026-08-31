import { and, desc, eq } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import { formVersions, submissions } from "../../../db/schema.js"
import type {
  SubmissionDetailRow,
  SubmissionRow,
  SubmissionsRepository,
  SubmissionSummaryRow,
} from "./submissions.js"

const SUBMISSION_COLUMNS = {
  id: submissions.id,
  formId: submissions.formId,
  formVersionId: submissions.formVersionId,
  status: submissions.status,
  data: submissions.data,
  submittedBy: submissions.submittedBy,
  submittedAt: submissions.submittedAt,
}

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
      .returning(SUBMISSION_COLUMNS)
    return row
  }

  async saveDraft(
    formId: string,
    formVersionId: string,
    data: unknown,
    submissionId?: string,
  ): Promise<SubmissionRow> {
    if (submissionId) {
      const [updated] = await this.db
        .update(submissions)
        .set({ data, formVersionId, updatedAt: new Date() })
        .where(
          and(
            eq(submissions.id, submissionId),
            eq(submissions.formId, formId),
            eq(submissions.status, "draft"),
          ),
        )
        .returning(SUBMISSION_COLUMNS)
      if (updated) return updated
    }

    const [created] = await this.db
      .insert(submissions)
      .values({ formId, formVersionId, data, status: "draft" })
      .returning(SUBMISSION_COLUMNS)
    return created
  }

  async getDraft(
    formId: string,
    submissionId: string,
  ): Promise<SubmissionRow | null> {
    const [row] = await this.db
      .select(SUBMISSION_COLUMNS)
      .from(submissions)
      .where(
        and(
          eq(submissions.id, submissionId),
          eq(submissions.formId, formId),
          eq(submissions.status, "draft"),
        ),
      )
    return row ?? null
  }

  async finalizeDraft(
    formId: string,
    submissionId: string,
    formVersionId: string,
    data: unknown,
    submittedBy?: string | null,
  ): Promise<SubmissionRow | null> {
    const [row] = await this.db
      .update(submissions)
      .set({
        data,
        formVersionId,
        submittedBy: submittedBy ?? null,
        status: "submitted",
        submittedAt: new Date(),
      })
      .where(
        and(
          eq(submissions.id, submissionId),
          eq(submissions.formId, formId),
          eq(submissions.status, "draft"),
        ),
      )
      .returning(SUBMISSION_COLUMNS)
    return row ?? null
  }

  async listByForm(formId: string): Promise<SubmissionSummaryRow[]> {
    return this.db
      .select({
        id: submissions.id,
        status: submissions.status,
        createdAt: submissions.createdAt,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .where(eq(submissions.formId, formId))
      .orderBy(desc(submissions.createdAt))
  }

  async getById(
    formId: string,
    submissionId: string,
  ): Promise<SubmissionDetailRow | null> {
    const [row] = await this.db
      .select({
        ...SUBMISSION_COLUMNS,
        formVersionNumber: formVersions.version,
        schema: formVersions.schema,
      })
      .from(submissions)
      .innerJoin(formVersions, eq(submissions.formVersionId, formVersions.id))
      .where(and(eq(submissions.id, submissionId), eq(submissions.formId, formId)))
    return row ?? null
  }
}
