import { and, desc, eq, max } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import { sessionTemplateVersions, sessionTemplates } from "../../../db/schema.js"
import {
  type SessionTemplateModuleSnapshotInput,
  type SessionTemplateVersionRow,
  type SessionTemplateVersionsRepository,
} from "./session-template-versions.js"

const VERSION_COLUMNS = {
  id: sessionTemplateVersions.id,
  sessionTemplateId: sessionTemplateVersions.sessionTemplateId,
  version: sessionTemplateVersions.version,
  modules: sessionTemplateVersions.modules,
  status: sessionTemplateVersions.status,
  createdAt: sessionTemplateVersions.createdAt,
  publishedAt: sessionTemplateVersions.publishedAt,
  publishedBy: sessionTemplateVersions.publishedBy,
}

export class DrizzleSessionTemplateVersionsRepository
  implements SessionTemplateVersionsRepository
{
  constructor(private readonly db: Db) {}

  async publish(
    sessionTemplateId: string,
    modules: SessionTemplateModuleSnapshotInput[],
    publishedBy?: string | null,
  ): Promise<SessionTemplateVersionRow> {
    return this.db.transaction(async (tx) => {
      // Locks the template's own row (rather than the aggregate query below
      // -- Postgres rejects `FOR UPDATE` combined with an aggregate
      // function) so two concurrent publishes serialize instead of both
      // computing the same next version number.
      await tx
        .select({ id: sessionTemplates.id })
        .from(sessionTemplates)
        .where(eq(sessionTemplates.id, sessionTemplateId))
        .for("update")

      const [{ maxVersion }] = await tx
        .select({ maxVersion: max(sessionTemplateVersions.version) })
        .from(sessionTemplateVersions)
        .where(eq(sessionTemplateVersions.sessionTemplateId, sessionTemplateId))

      const nextVersion = (maxVersion ?? 0) + 1

      await tx
        .update(sessionTemplateVersions)
        .set({ status: "superseded" })
        .where(
          and(
            eq(sessionTemplateVersions.sessionTemplateId, sessionTemplateId),
            eq(sessionTemplateVersions.status, "published"),
          ),
        )

      const [published] = await tx
        .insert(sessionTemplateVersions)
        .values({
          sessionTemplateId,
          version: nextVersion,
          modules,
          status: "published",
          publishedBy: publishedBy ?? null,
        })
        .returning(VERSION_COLUMNS)

      return published
    })
  }

  async getActiveVersion(
    sessionTemplateId: string,
  ): Promise<SessionTemplateVersionRow | null> {
    const [active] = await this.db
      .select(VERSION_COLUMNS)
      .from(sessionTemplateVersions)
      .where(
        and(
          eq(sessionTemplateVersions.sessionTemplateId, sessionTemplateId),
          eq(sessionTemplateVersions.status, "published"),
        ),
      )
    return active ?? null
  }

  async listVersions(
    sessionTemplateId: string,
  ): Promise<SessionTemplateVersionRow[]> {
    return this.db
      .select(VERSION_COLUMNS)
      .from(sessionTemplateVersions)
      .where(eq(sessionTemplateVersions.sessionTemplateId, sessionTemplateId))
      .orderBy(desc(sessionTemplateVersions.createdAt))
  }

  async getVersionById(
    versionId: string,
  ): Promise<SessionTemplateVersionRow | null> {
    const [version] = await this.db
      .select(VERSION_COLUMNS)
      .from(sessionTemplateVersions)
      .where(eq(sessionTemplateVersions.id, versionId))
    return version ?? null
  }
}
