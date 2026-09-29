import { ConfidentialClientApplication } from "@azure/msal-node"
import { pino } from "pino"
import type { RecordStore } from "./adapters/adapter.js"
import { FakeRecordStore } from "./adapters/fake.js"
import { IcisRecordStore } from "./adapters/icis.js"
import { buildApp } from "./app.js"
import { BindingCreator } from "./creator.js"
import {
  BindingRegistry,
  InMemoryConfiguredBindingRepository,
  PostgresConfiguredBindingRepository,
} from "./registry.js"
import { createDb } from "./db/client.js"
import {
  InMemoryIdentityRegistry,
  PostgresIdentityRegistry,
  type IdentityRegistry,
} from "./identity.js"
import { BindingService } from "./service.js"

const logger = pino()

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    logger.error(`${name} is not set`)
    process.exit(1)
  }
  return value
}

// Service identity via client credentials. The requirements (§8) prohibit
// this for real clinical writes -- they need the end user's delegated
// (on-behalf-of) token -- so this is prototype-only.
function icisStore(): RecordStore {
  const orgUrl = requireEnv("DYNAMICS_URL").replace(/\/$/, "")
  const privilegeTtlMs = process.env.ICIS_PRIVILEGE_CACHE_MS
    ? Number(process.env.ICIS_PRIVILEGE_CACHE_MS)
    : undefined

  // The mock ICIS (mock-icis/) accepts a fixed token instead of an Entra
  // sign-in. Refused for anything but a local URL, so a demo setting can
  // never end up pointed at a real environment.
  const staticToken = process.env.ICIS_STATIC_TOKEN
  if (staticToken) {
    const host = new URL(orgUrl).hostname
    if (host !== "localhost" && host !== "127.0.0.1") {
      logger.error("ICIS_STATIC_TOKEN is only allowed with a localhost DYNAMICS_URL")
      process.exit(1)
    }
    return new IcisRecordStore(orgUrl, async () => staticToken, fetch, privilegeTtlMs)
  }

  const msal = new ConfidentialClientApplication({
    auth: {
      clientId: requireEnv("AZURE_CLIENT_ID"),
      clientSecret: requireEnv("AZURE_CLIENT_SECRET"),
      authority: `https://login.microsoftonline.com/${requireEnv("AZURE_TENANT_ID")}`,
    },
  })
  return new IcisRecordStore(orgUrl, async () => {
    const result = await msal.acquireTokenByClientCredential({
      scopes: [`${orgUrl}/.default`],
    })
    if (!result) throw new Error("No ICIS access token returned")
    return result.accessToken
  }, fetch, privilegeTtlMs)
}

const adapter = process.env.ADAPTER ?? "fake"
const store = adapter === "icis" ? icisStore() : new FakeRecordStore()

// The DBS's own database (never form-builder's): the identities it issues
// (client anchor IDs, option codes) and the bindings stewards create. Both
// are as durable as the submissions that reference them, so a real store
// requires it. Only the in-memory fake store may run without one, since its
// records vanish on restart anyway.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl && adapter !== "fake") {
  logger.error(
    "DATABASE_URL is not set: a real store needs the DBS's own database (run `npm run db:migrate -w binding-service` first)",
  )
  process.exit(1)
}
const db = databaseUrl ? createDb(databaseUrl) : null
const registry = new BindingRegistry(
  db ? new PostgresConfiguredBindingRepository(db) : new InMemoryConfiguredBindingRepository(),
)
const identities: IdentityRegistry = db
  ? new PostgresIdentityRegistry(db)
  : new InMemoryIdentityRegistry()
const app = buildApp(
  new BindingService(store, registry, identities),
  new BindingCreator(store, registry),
  logger,
)

const port = Number(process.env.PORT ?? 3100)
app
  .listen({ port, host: "127.0.0.1" })
  .then(() =>
    logger.info(
      { adapter, database: db ? new URL(databaseUrl!).pathname.slice(1) : "in memory" },
      "data binding service ready",
    ),
  )
  .catch((err: unknown) => {
    logger.error({ err }, "failed to start data binding service")
    process.exit(1)
  })
