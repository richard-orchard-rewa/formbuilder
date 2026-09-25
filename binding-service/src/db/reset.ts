import { sql } from "drizzle-orm"
import { createDb } from "./client.js"

// Empties the identity tables -- for resetting a demo, never a real
// environment. `npm run db:reset:demo -w binding-service` (part of
// `npm run demo:reset`) runs it against .env.demo's database only.

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}
const name = new URL(url).pathname.slice(1)
if (!name.endsWith("_demo") && !name.endsWith("_test")) {
  console.error(`Refusing to reset "${name}": only *_demo or *_test databases can be reset`)
  process.exit(1)
}

const db = createDb(url)
try {
  await db.execute(sql`truncate option_code_refs, option_codes, anchor_refs, anchors`)
  console.log(`Reset identities in ${name}`)
} finally {
  await db.$client.end()
}
