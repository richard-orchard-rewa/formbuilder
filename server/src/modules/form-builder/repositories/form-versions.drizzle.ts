import { and, eq, max } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import { formVersions } from "../../../db/schema.js"
import {
  NoDraftVersionError,
  type FormVersionRow,
  type FormVersionsRepository,
} from "./form-versions.js"

const VERSION_COLUMNS = {
  id: formVersions.id,
  formId: formVersions.formId,
  version: formVersions.version,
  schema: formVersions.schema,
  status: formVersions.status,
  createdAt: formVersions.createdAt,
  publishedAt: formVersions.publishedAt,
}

export class DrizzleFormVersionsRepository implements FormVersionsRepository {
  constructor(private readonly db: Db) {}

  async publishDraft(formId: string): Promise<FormVersionRow> {
    return this.db.transaction(async (tx) => {
      const [draft] = await tx
        .select(VERSION_COLUMNS)
        .from(formVersions)
        .where(
          and(eq(formVersions.formId, formId), eq(formVersions.status, "draft")),
        )
        .for("update")

      if (!draft) {
        throw new NoDraftVersionError(formId)
      }

      const [{ maxVersion }] = await tx
        .select({ maxVersion: max(formVersions.version) })
        .from(formVersions)
        .where(eq(formVersions.formId, formId))

      const nextVersion = (maxVersion ?? 0) + 1

      await tx
        .update(formVersions)
        .set({ status: "superseded" })
        .where(
          and(
            eq(formVersions.formId, formId),
            eq(formVersions.status, "published"),
          ),
        )

      const [published] = await tx
        .update(formVersions)
        .set({ version: nextVersion, status: "published", publishedAt: new Date() })
        .where(eq(formVersions.id, draft.id))
        .returning(VERSION_COLUMNS)

      return published
    })
  }
}
