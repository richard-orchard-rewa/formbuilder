import { pino } from "pino"
import { buildApp } from "./index.js"
import { createDb } from "./db/client.js"
import { buildDeps } from "./deps.js"
import { HttpBindingClient } from "./modules/bindings/binding-client.js"

const logger = pino()

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  logger.error("DATABASE_URL is not set")
  process.exit(1)
}

const db = createDb(databaseUrl)
// The Data Binding Service (docs/proposals/databound-fields.md). If it isn't
// running, forms without data-bound fields are unaffected.
const bindingClient = new HttpBindingClient(
  process.env.BINDING_SERVICE_URL ?? "http://localhost:3100",
)
const app = buildApp(buildDeps(db, bindingClient), logger)

const port = Number(process.env.PORT ?? 3000)
app
  .listen({ port, host: "0.0.0.0" })
  .catch((err: unknown) => {
    logger.error({ err }, "failed to start server")
    process.exit(1)
  })
