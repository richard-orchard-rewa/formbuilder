import { and, desc, eq, max } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import { forms, formVersions } from "../../../db/schema.js"
import {
  FormNotFoundError,
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
  publishedBy: formVersions.publishedBy,
}

export class DrizzleFormVersionsRepository implements FormVersionsRepository {
  constructor(private readonly db: Db) {}

  async publishDraft(
    formId: string,
    publishedBy?: string | null,
  ): Promise<FormVersionRow> {
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
        .set({
          version: nextVersion,
          status: "published",
          publishedAt: new Date(),
          publishedBy: publishedBy ?? null,
        })
        .where(eq(formVersions.id, draft.id))
        .returning(VERSION_COLUMNS)

      return published
    })
  }

  async editDraft(formId: string, schema: unknown): Promise<FormVersionRow> {
    return this.db.transaction(async (tx) => {
      const [draft] = await tx
        .select(VERSION_COLUMNS)
        .from(formVersions)
        .where(
          and(eq(formVersions.formId, formId), eq(formVersions.status, "draft")),
        )
        .for("update")

      if (draft) {
        const [updated] = await tx
          .update(formVersions)
          .set({ schema })
          .where(eq(formVersions.id, draft.id))
          .returning(VERSION_COLUMNS)
        return updated
      }

      const [form] = await tx
        .select({ id: forms.id })
        .from(forms)
        .where(eq(forms.id, formId))

      if (!form) {
        throw new FormNotFoundError(formId)
      }

      const [created] = await tx
        .insert(formVersions)
        .values({ formId, version: 0, schema, status: "draft" })
        .returning(VERSION_COLUMNS)
      return created
    })
  }

  async listVersions(formId: string): Promise<FormVersionRow[]> {
    const [form] = await this.db
      .select({ id: forms.id })
      .from(forms)
      .where(eq(forms.id, formId))

    if (!form) {
      throw new FormNotFoundError(formId)
    }

    return this.db
      .select(VERSION_COLUMNS)
      .from(formVersions)
      .where(eq(formVersions.formId, formId))
      .orderBy(desc(formVersions.createdAt))
  }

  async getDraft(formId: string): Promise<FormVersionRow | null> {
    const [draft] = await this.db
      .select(VERSION_COLUMNS)
      .from(formVersions)
      .where(
        and(eq(formVersions.formId, formId), eq(formVersions.status, "draft")),
      )

    if (draft) {
      return draft
    }

    const [form] = await this.db
      .select({ id: forms.id })
      .from(forms)
      .where(eq(forms.id, formId))

    if (!form) {
      throw new FormNotFoundError(formId)
    }

    return null
  }
}
