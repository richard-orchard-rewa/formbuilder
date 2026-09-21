import type { Db } from "../../../db/client.js"
import { sessionTemplateSubmissions } from "../../../db/schema.js"
import type {
  CreateSessionTemplateSubmissionInput,
  SessionTemplateSubmissionRow,
  SessionTemplateSubmissionsRepository,
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
}
