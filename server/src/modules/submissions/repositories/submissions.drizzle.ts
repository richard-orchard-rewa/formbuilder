import { and, desc, eq, gte, lte } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import {
  formVersions,
  submissionEdits,
  submissions,
} from "../../../db/schema.js"
import type {
  SubmissionDetailRow,
  SubmissionEditRow,
  SubmissionListFilters,
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

  async listByForm(
    formId: string,
    filters?: SubmissionListFilters,
  ): Promise<SubmissionSummaryRow[]> {
    const conditions = [eq(submissions.formId, formId)]
    if (filters?.from) conditions.push(gte(submissions.createdAt, filters.from))
    if (filters?.to) conditions.push(lte(submissions.createdAt, filters.to))
    if (filters?.formVersionNumber !== undefined) {
      conditions.push(eq(formVersions.version, filters.formVersionNumber))
    }

    return this.db
      .select({
        id: submissions.id,
        status: submissions.status,
        formVersionNumber: formVersions.version,
        createdAt: submissions.createdAt,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .innerJoin(formVersions, eq(submissions.formVersionId, formVersions.id))
      .where(and(...conditions))
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

  async edit(
    formId: string,
    submissionId: string,
    data: unknown,
    editedBy?: string | null,
  ): Promise<SubmissionRow | null> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ data: submissions.data })
        .from(submissions)
        .where(
          and(
            eq(submissions.id, submissionId),
            eq(submissions.formId, formId),
            eq(submissions.status, "submitted"),
          ),
        )
      if (!existing) return null

      await tx.insert(submissionEdits).values({
        submissionId,
        previousData: existing.data,
        editedBy: editedBy ?? null,
      })

      const [updated] = await tx
        .update(submissions)
        .set({ data, updatedAt: new Date() })
        .where(eq(submissions.id, submissionId))
        .returning(SUBMISSION_COLUMNS)
      return updated
    })
  }

  async listEdits(submissionId: string): Promise<SubmissionEditRow[]> {
    return this.db
      .select({
        id: submissionEdits.id,
        submissionId: submissionEdits.submissionId,
        previousData: submissionEdits.previousData,
        editedBy: submissionEdits.editedBy,
        editedAt: submissionEdits.editedAt,
      })
      .from(submissionEdits)
      .where(eq(submissionEdits.submissionId, submissionId))
      .orderBy(desc(submissionEdits.editedAt))
  }
}
