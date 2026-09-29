import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

export function createPool(connectionString: string) {
  return new Pool({ connectionString })
}

export function createDb(connectionString: string) {
  return drizzle(createPool(connectionString))
}

export type Db = ReturnType<typeof createDb>
