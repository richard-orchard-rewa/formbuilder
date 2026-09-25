import { ConfidentialClientApplication } from "@azure/msal-node"
import { pino } from "pino"
import { fileURLToPath } from "node:url"
import type { RecordStore } from "./adapters/adapter.js"
import { FakeRecordStore } from "./adapters/fake.js"
import { IcisRecordStore } from "./adapters/icis.js"
import { buildApp } from "./app.js"
import { BindingCreator } from "./creator.js"
import {
  BindingRegistry,
  JsonFileConfiguredBindingRepository,
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

// Bindings created in the binding creator, kept by the DBS itself. One file
// per adapter, so bindings made against the fake store don't appear when
// running against ICIS (or vice versa).
const bindingsFile =
  process.env.BINDINGS_FILE ??
  fileURLToPath(new URL(`../data/bindings.${adapter}.json`, import.meta.url))
const registry = new BindingRegistry(
  new JsonFileConfiguredBindingRepository(bindingsFile),
)
// DBS-owned identities (client anchor IDs, option codes) and how they map
// to this store's IDs, kept in the DBS's own database -- as durable as the
// submissions that hold them. Only the in-memory fake store may run
// without one, since its records vanish on restart anyway.
function identityRegistry(): IdentityRegistry {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl) return new PostgresIdentityRegistry(createDb(databaseUrl))
  if (adapter !== "fake") {
    logger.error(
      "DATABASE_URL is not set: the identity registry must be durable for a real store (run `npm run db:migrate -w binding-service` first)",
    )
    process.exit(1)
  }
  return new InMemoryIdentityRegistry()
}
const identities = identityRegistry()
const app = buildApp(
  new BindingService(store, registry, identities),
  new BindingCreator(store, registry),
  logger,
)

const port = Number(process.env.PORT ?? 3100)
app
  .listen({ port, host: "127.0.0.1" })
  .then(() => logger.info({ adapter, bindingsFile }, "data binding service ready"))
  .catch((err: unknown) => {
    logger.error({ err }, "failed to start data binding service")
    process.exit(1)
  })
