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
  })
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
const app = buildApp(
  new BindingService(store, registry),
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
