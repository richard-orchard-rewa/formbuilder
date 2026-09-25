import { existsSync } from "node:fs"
import { readFile, rename } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client, Pool } from "pg"
import type { Db } from "./client.js"
import {
  PostgresConfiguredBindingRepository,
  type ConfiguredBinding,
} from "../registry.js"

// Creates the Data Binding Service's database if it doesn't exist yet, then
// applies its migrations. Its own database: on the same Postgres server as
// form-builder's locally, but never form-builder's database itself.
//
//   npm run db:migrate -w binding-service         (uses binding-service/.env)
//   npm run db:migrate:demo -w binding-service    (uses .env.demo)

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const target = new URL(url)
const name = decodeURIComponent(target.pathname.slice(1))
// Interpolated into CREATE DATABASE below, so allow only plain identifiers.
if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
  console.error(`Refusing unusual database name "${name}"`)
  process.exit(1)
}

const maintenance = new URL(url)
maintenance.pathname = "/postgres"
const admin = new Client({ connectionString: maintenance.toString() })
await admin.connect()
try {
  const exists = await admin.query("select 1 from pg_database where datname = $1", [name])
  if (exists.rowCount === 0) {
    await admin.query(`create database "${name}"`)
    console.log(`Created database ${name}`)
  }
} finally {
  await admin.end()
}

const pool = new Pool({ connectionString: url })
try {
  const db = drizzle(pool)
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
  })
  console.log(`Database ${name} is up to date`)
  await importLegacyBindings(db)
} finally {
  await pool.end()
}

// Before configured bindings moved into this database they were a JSON file
// per adapter. If one is still there, bring its bindings across (saving is
// idempotent) and rename the file so it's only ever imported once.
async function importLegacyBindings(db: Db) {
  const packageDir = fileURLToPath(new URL("../../", import.meta.url))
  const file = resolve(
    packageDir,
    process.env.BINDINGS_FILE ?? `data/bindings.${process.env.ADAPTER ?? "fake"}.json`,
  )
  if (!existsSync(file)) return
  const bindings = JSON.parse(await readFile(file, "utf8")) as ConfiguredBinding[]
  const repo = new PostgresConfiguredBindingRepository(db)
  for (const binding of bindings) await repo.save(binding)
  await rename(file, `${file}.imported`)
  console.log(`Imported ${bindings.length} configured binding(s) from ${file}`)
}
