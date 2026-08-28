import { pino } from "pino"
import { buildApp } from "./index.js"
import { createDb } from "./db/client.js"
import { buildDeps } from "./deps.js"

const logger = pino()

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  logger.error("DATABASE_URL is not set")
  process.exit(1)
}

const db = createDb(databaseUrl)
const app = buildApp(buildDeps(db), logger)

const port = Number(process.env.PORT ?? 3000)
app
  .listen({ port, host: "0.0.0.0" })
  .catch((err: unknown) => {
    logger.error({ err }, "failed to start server")
    process.exit(1)
  })
