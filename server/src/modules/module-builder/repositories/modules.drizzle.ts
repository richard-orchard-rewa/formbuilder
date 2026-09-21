import { and, desc, eq, ilike, isNull } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import { modules, moduleVersions } from "../../../db/schema.js"
import {
  ModuleNotFoundError,
  type CreateModuleInput,
  type ModuleListRow,
  type ModuleRow,
  type ModulesRepository,
} from "./modules.js"

const MODULE_COLUMNS = {
  id: modules.id,
  name: modules.name,
  description: modules.description,
  archivedAt: modules.archivedAt,
  createdAt: modules.createdAt,
}

// Escapes ILIKE's own special characters so a search term is matched
// literally rather than as a pattern -- a name containing "%" or "_"
// shouldn't act as a wildcard.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export class DrizzleModulesRepository implements ModulesRepository {
  constructor(private readonly db: Db) {}

  async list(query?: string): Promise<ModuleListRow[]> {
    const trimmed = query?.trim()
    const conditions = [isNull(modules.archivedAt)]
    if (trimmed) {
      conditions.push(ilike(modules.name, `%${escapeLikePattern(trimmed)}%`))
    }
    // Left-joined on the (at most one, per the DB's own unique index)
    // published version -- a null match means the module has never been
    // published (US-8.2 needs to tell those apart in the picker).
    const rows = await this.db
      .select({ ...MODULE_COLUMNS, publishedVersionId: moduleVersions.id })
      .from(modules)
      .leftJoin(
        moduleVersions,
        and(
          eq(moduleVersions.moduleId, modules.id),
          eq(moduleVersions.status, "published"),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(modules.createdAt))

    return rows.map(({ publishedVersionId, ...row }) => ({
      ...row,
      hasPublishedVersion: publishedVersionId !== null,
    }))
  }

  // Creates the module and its initial draft version (v0, unpublished)
  // together, mirroring DrizzleFormsRepository.create -- a module is never
  // left without a version to edit.
  async create({ name, description }: CreateModuleInput): Promise<ModuleRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(modules)
        .values({ name, description: description ?? null })
        .returning(MODULE_COLUMNS)

      await tx.insert(moduleVersions).values({
        moduleId: row.id,
        version: 0,
        schema: { fields: [] },
        status: "draft",
      })

      return row
    })
  }

  async archive(moduleId: string): Promise<ModuleRow> {
    const [row] = await this.db
      .update(modules)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(modules.id, moduleId))
      .returning(MODULE_COLUMNS)
    if (!row) throw new ModuleNotFoundError(moduleId)
    return row
  }

  async getById(moduleId: string): Promise<ModuleRow | null> {
    const [row] = await this.db
      .select(MODULE_COLUMNS)
      .from(modules)
      .where(eq(modules.id, moduleId))
    return row ?? null
  }
}
