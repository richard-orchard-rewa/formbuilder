import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import {
  formVersions,
  submissionHistory,
  submissions,
} from "../../../db/schema.js"
import type {
  CreateMigratedInput,
  SubmissionDetailRow,
  SubmissionHistoryRow,
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
  legacyData: submissions.legacyData,
  migratedFromSubmissionId: submissions.migratedFromSubmissionId,
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
        migratedFromSubmissionId: submissions.migratedFromSubmissionId,
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
      // Transaction-local: read by the archive trigger via
      // current_setting('app.edited_by', true), since a trigger has no
      // direct access to this call's arguments.
      await tx.execute(
        sql`select set_config('app.edited_by', ${editedBy ?? ""}, true)`,
      )

      const [updated] = await tx
        .update(submissions)
        .set({ data, updatedAt: new Date() })
        .where(
          and(
            eq(submissions.id, submissionId),
            eq(submissions.formId, formId),
            eq(submissions.status, "submitted"),
          ),
        )
        .returning(SUBMISSION_COLUMNS)
      return updated ?? null
    })
  }

  async listVersions(submissionId: string): Promise<SubmissionHistoryRow[]> {
    const [archived, [current]] = await Promise.all([
      this.db
        .select({
          id: submissionHistory.id,
          submissionId: submissionHistory.submissionId,
          formVersionId: submissionHistory.formVersionId,
          data: submissionHistory.data,
          legacyData: submissionHistory.legacyData,
          status: submissionHistory.status,
          submittedBy: submissionHistory.submittedBy,
          migratedFromSubmissionId: submissionHistory.migratedFromSubmissionId,
          editedBy: submissionHistory.editedBy,
          activeFrom: submissionHistory.activeFrom,
          activeTo: submissionHistory.activeTo,
        })
        .from(submissionHistory)
        .where(eq(submissionHistory.submissionId, submissionId))
        .orderBy(asc(submissionHistory.activeFrom)),
      this.db
        .select({
          id: submissions.id,
          formVersionId: submissions.formVersionId,
          data: submissions.data,
          legacyData: submissions.legacyData,
          status: submissions.status,
          submittedBy: submissions.submittedBy,
          migratedFromSubmissionId: submissions.migratedFromSubmissionId,
          activeFrom: submissions.updatedAt,
        })
        .from(submissions)
        .where(eq(submissions.id, submissionId)),
    ])

    if (!current) return archived

    // The edit that most recently closed out an archived version is the
    // same edit that produced the current one -- there's no separate
    // record of "who made the current version" otherwise.
    const producedBy = archived.at(-1)?.editedBy ?? null

    return [
      ...archived,
      {
        id: current.id,
        submissionId,
        formVersionId: current.formVersionId,
        data: current.data,
        legacyData: current.legacyData,
        status: current.status,
        submittedBy: current.submittedBy,
        migratedFromSubmissionId: current.migratedFromSubmissionId,
        editedBy: producedBy,
        activeFrom: current.activeFrom,
        activeTo: null,
      },
    ]
  }

  async createMigrated(input: CreateMigratedInput): Promise<SubmissionRow> {
    const [row] = await this.db
      .insert(submissions)
      .values({
        formId: input.formId,
        formVersionId: input.formVersionId,
        data: input.data,
        legacyData: input.legacyData,
        status: input.status,
        migratedFromSubmissionId: input.migratedFromSubmissionId,
        submittedBy: input.migratedBy ?? null,
        submittedAt: input.status === "submitted" ? new Date() : null,
      })
      .returning(SUBMISSION_COLUMNS)
    return row
  }

  async findMigratedCopy(
    submissionId: string,
    formVersionId: string,
  ): Promise<SubmissionRow | null> {
    const [row] = await this.db
      .select(SUBMISSION_COLUMNS)
      .from(submissions)
      .where(
        and(
          eq(submissions.migratedFromSubmissionId, submissionId),
          eq(submissions.formVersionId, formVersionId),
        ),
      )
    return row ?? null
  }

  async listSubmittedByVersion(
    formId: string,
    formVersionId: string,
  ): Promise<{ id: string }[]> {
    return this.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.formId, formId),
          eq(submissions.formVersionId, formVersionId),
          eq(submissions.status, "submitted"),
        ),
      )
  }
}
