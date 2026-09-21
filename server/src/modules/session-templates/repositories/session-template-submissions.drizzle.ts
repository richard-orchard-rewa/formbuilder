import { and, desc, eq } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import {
  sessionTemplateSubmissions,
  sessionTemplateVersions,
} from "../../../db/schema.js"
import type {
  CreateSessionTemplateSubmissionInput,
  SessionTemplateSubmissionRow,
  SessionTemplateSubmissionsRepository,
  SessionTemplateSubmissionSummaryRow,
} from "./session-template-submissions.js"

const SUBMISSION_COLUMNS = {
  id: sessionTemplateSubmissions.id,
  sessionTemplateId: sessionTemplateSubmissions.sessionTemplateId,
  sessionTemplateVersionId: sessionTemplateSubmissions.sessionTemplateVersionId,
  data: sessionTemplateSubmissions.data,
  submittedBy: sessionTemplateSubmissions.submittedBy,
  submittedAt: sessionTemplateSubmissions.submittedAt,
}

export class DrizzleSessionTemplateSubmissionsRepository
  implements SessionTemplateSubmissionsRepository
{
  constructor(private readonly db: Db) {}

  async create(
    input: CreateSessionTemplateSubmissionInput,
  ): Promise<SessionTemplateSubmissionRow> {
    const [row] = await this.db
      .insert(sessionTemplateSubmissions)
      .values({
        sessionTemplateId: input.sessionTemplateId,
        sessionTemplateVersionId: input.sessionTemplateVersionId,
        data: input.data,
        submittedBy: input.submittedBy ?? null,
      })
      .returning(SUBMISSION_COLUMNS)
    return row
  }

  async list(
    sessionTemplateId: string,
  ): Promise<SessionTemplateSubmissionSummaryRow[]> {
    return this.db
      .select({
        id: sessionTemplateSubmissions.id,
        sessionTemplateVersionNumber: sessionTemplateVersions.version,
        submittedBy: sessionTemplateSubmissions.submittedBy,
        submittedAt: sessionTemplateSubmissions.submittedAt,
      })
      .from(sessionTemplateSubmissions)
      .innerJoin(
        sessionTemplateVersions,
        eq(
          sessionTemplateSubmissions.sessionTemplateVersionId,
          sessionTemplateVersions.id,
        ),
      )
      .where(eq(sessionTemplateSubmissions.sessionTemplateId, sessionTemplateId))
      .orderBy(desc(sessionTemplateSubmissions.submittedAt))
  }

  async getById(
    sessionTemplateId: string,
    submissionId: string,
  ): Promise<SessionTemplateSubmissionRow | null> {
    const [row] = await this.db
      .select(SUBMISSION_COLUMNS)
      .from(sessionTemplateSubmissions)
      .where(
        and(
          eq(sessionTemplateSubmissions.id, submissionId),
          eq(sessionTemplateSubmissions.sessionTemplateId, sessionTemplateId),
        ),
      )
    return row ?? null
  }
}
