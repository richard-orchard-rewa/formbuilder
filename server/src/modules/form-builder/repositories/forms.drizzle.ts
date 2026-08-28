import { desc } from "drizzle-orm"
import type { Db } from "../../../db/client.js"
import { forms } from "../../../db/schema.js"
import type { FormRow, FormsRepository } from "./forms.js"

export class DrizzleFormsRepository implements FormsRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<FormRow[]> {
    return this.db
      .select({ id: forms.id, name: forms.name, createdAt: forms.createdAt })
      .from(forms)
      .orderBy(desc(forms.createdAt))
  }

  async create(name: string): Promise<FormRow> {
    const [row] = await this.db
      .insert(forms)
      .values({ name })
      .returning({ id: forms.id, name: forms.name, createdAt: forms.createdAt })
    return row
  }
}
