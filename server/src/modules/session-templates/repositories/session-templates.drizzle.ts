import { and, asc, desc, eq, ilike, isNull } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import {
  modules,
  sessionTemplateModules,
  sessionTemplates,
} from "../../../db/schema.js"
import {
  SessionTemplateNotFoundError,
  type CreateSessionTemplateInput,
  type SessionTemplateModuleRow,
  type SessionTemplateRow,
  type SessionTemplatesRepository,
} from "./session-templates.js"

const TEMPLATE_COLUMNS = {
  id: sessionTemplates.id,
  name: sessionTemplates.name,
  description: sessionTemplates.description,
  archivedAt: sessionTemplates.archivedAt,
  createdAt: sessionTemplates.createdAt,
}

// Mirrors DrizzleModulesRepository's search escaping exactly.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export class DrizzleSessionTemplatesRepository
  implements SessionTemplatesRepository
{
  constructor(private readonly db: Db) {}

  async list(query?: string): Promise<SessionTemplateRow[]> {
    const trimmed = query?.trim()
    const conditions = [isNull(sessionTemplates.archivedAt)]
    if (trimmed) {
      conditions.push(
        ilike(sessionTemplates.name, `%${escapeLikePattern(trimmed)}%`),
      )
    }
    return this.db
      .select(TEMPLATE_COLUMNS)
      .from(sessionTemplates)
      .where(and(...conditions))
      .orderBy(desc(sessionTemplates.createdAt))
  }

  async create({
    name,
    description,
  }: CreateSessionTemplateInput): Promise<SessionTemplateRow> {
    const [row] = await this.db
      .insert(sessionTemplates)
      .values({ name, description: description ?? null })
      .returning(TEMPLATE_COLUMNS)
    return row
  }

  async archive(sessionTemplateId: string): Promise<SessionTemplateRow> {
    const [row] = await this.db
      .update(sessionTemplates)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessionTemplates.id, sessionTemplateId))
      .returning(TEMPLATE_COLUMNS)
    if (!row) throw new SessionTemplateNotFoundError(sessionTemplateId)
    return row
  }

  async getComposition(
    sessionTemplateId: string,
  ): Promise<SessionTemplateModuleRow[]> {
    await this.requireExists(sessionTemplateId)
    return this.db
      .select({
        moduleId: sessionTemplateModules.moduleId,
        name: modules.name,
        position: sessionTemplateModules.position,
      })
      .from(sessionTemplateModules)
      .innerJoin(modules, eq(sessionTemplateModules.moduleId, modules.id))
      .where(eq(sessionTemplateModules.sessionTemplateId, sessionTemplateId))
      .orderBy(asc(sessionTemplateModules.position))
  }

  async setComposition(
    sessionTemplateId: string,
    moduleIds: string[],
  ): Promise<SessionTemplateModuleRow[]> {
    await this.requireExists(sessionTemplateId)
    await this.db.transaction(async (tx) => {
      await tx
        .delete(sessionTemplateModules)
        .where(eq(sessionTemplateModules.sessionTemplateId, sessionTemplateId))
      if (moduleIds.length > 0) {
        await tx.insert(sessionTemplateModules).values(
          moduleIds.map((moduleId, index) => ({
            sessionTemplateId,
            moduleId,
            position: index,
          })),
        )
      }
    })
    return this.getComposition(sessionTemplateId)
  }

  private async requireExists(sessionTemplateId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: sessionTemplates.id })
      .from(sessionTemplates)
      .where(eq(sessionTemplates.id, sessionTemplateId))
    if (!row) throw new SessionTemplateNotFoundError(sessionTemplateId)
  }
}
