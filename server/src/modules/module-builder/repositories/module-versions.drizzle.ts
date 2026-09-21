import { and, eq, max } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import { modules, moduleVersions } from "../../../db/schema.js"
import { ModuleNotFoundError } from "./modules.js"
import {
  NoDraftVersionError,
  type ModuleVersionRow,
  type ModuleVersionsRepository,
} from "./module-versions.js"

const VERSION_COLUMNS = {
  id: moduleVersions.id,
  moduleId: moduleVersions.moduleId,
  version: moduleVersions.version,
  schema: moduleVersions.schema,
  status: moduleVersions.status,
  createdAt: moduleVersions.createdAt,
  publishedAt: moduleVersions.publishedAt,
  publishedBy: moduleVersions.publishedBy,
}

export class DrizzleModuleVersionsRepository
  implements ModuleVersionsRepository
{
  constructor(private readonly db: Db) {}

  async publishDraft(
    moduleId: string,
    publishedBy?: string | null,
  ): Promise<ModuleVersionRow> {
    return this.db.transaction(async (tx) => {
      const [draft] = await tx
        .select(VERSION_COLUMNS)
        .from(moduleVersions)
        .where(
          and(
            eq(moduleVersions.moduleId, moduleId),
            eq(moduleVersions.status, "draft"),
          ),
        )
        .for("update")

      if (!draft) {
        throw new NoDraftVersionError(moduleId)
      }

      const [{ maxVersion }] = await tx
        .select({ maxVersion: max(moduleVersions.version) })
        .from(moduleVersions)
        .where(eq(moduleVersions.moduleId, moduleId))

      const nextVersion = (maxVersion ?? 0) + 1

      await tx
        .update(moduleVersions)
        .set({ status: "superseded" })
        .where(
          and(
            eq(moduleVersions.moduleId, moduleId),
            eq(moduleVersions.status, "published"),
          ),
        )

      const [published] = await tx
        .update(moduleVersions)
        .set({
          version: nextVersion,
          status: "published",
          publishedAt: new Date(),
          publishedBy: publishedBy ?? null,
        })
        .where(eq(moduleVersions.id, draft.id))
        .returning(VERSION_COLUMNS)

      return published
    })
  }

  async editDraft(moduleId: string, schema: unknown): Promise<ModuleVersionRow> {
    return this.db.transaction(async (tx) => {
      const [draft] = await tx
        .select(VERSION_COLUMNS)
        .from(moduleVersions)
        .where(
          and(
            eq(moduleVersions.moduleId, moduleId),
            eq(moduleVersions.status, "draft"),
          ),
        )
        .for("update")

      if (draft) {
        const [updated] = await tx
          .update(moduleVersions)
          .set({ schema })
          .where(eq(moduleVersions.id, draft.id))
          .returning(VERSION_COLUMNS)
        return updated
      }

      const [mod] = await tx
        .select({ id: modules.id })
        .from(modules)
        .where(eq(modules.id, moduleId))

      if (!mod) {
        throw new ModuleNotFoundError(moduleId)
      }

      const [created] = await tx
        .insert(moduleVersions)
        .values({ moduleId, version: 0, schema, status: "draft" })
        .returning(VERSION_COLUMNS)
      return created
    })
  }

  async getDraft(moduleId: string): Promise<ModuleVersionRow | null> {
    const [draft] = await this.db
      .select(VERSION_COLUMNS)
      .from(moduleVersions)
      .where(
        and(
          eq(moduleVersions.moduleId, moduleId),
          eq(moduleVersions.status, "draft"),
        ),
      )

    if (draft) {
      return draft
    }

    const [mod] = await this.db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.id, moduleId))

    if (!mod) {
      throw new ModuleNotFoundError(moduleId)
    }

    return null
  }

  async getActiveVersion(moduleId: string): Promise<ModuleVersionRow | null> {
    const [active] = await this.db
      .select(VERSION_COLUMNS)
      .from(moduleVersions)
      .where(
        and(
          eq(moduleVersions.moduleId, moduleId),
          eq(moduleVersions.status, "published"),
        ),
      )

    if (active) {
      return active
    }

    const [mod] = await this.db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.id, moduleId))

    if (!mod) {
      throw new ModuleNotFoundError(moduleId)
    }

    return null
  }
}
