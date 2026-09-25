import type { Db } from "../../../db/client.js"
import { submissionBindings } from "../../../db/schema.js"
import type {
  SubmissionBindingRecord,
  SubmissionBindingsRepository,
} from "./submission-bindings.js"

export class DrizzleSubmissionBindingsRepository
  implements SubmissionBindingsRepository
{
  constructor(private readonly db: Db) {}

  async record(entry: SubmissionBindingRecord): Promise<void> {
    await this.db.insert(submissionBindings).values(entry)
  }
}
