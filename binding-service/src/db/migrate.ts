import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client, Pool } from "pg"

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
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
  })
  console.log(`Database ${name} is up to date`)
} finally {
  await pool.end()
}
