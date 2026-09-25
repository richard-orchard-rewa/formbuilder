import { ConfidentialClientApplication } from "@azure/msal-node"
import { pino } from "pino"
import type { ClientStore } from "./adapters/adapter.js"
import { FakeClientStore } from "./adapters/fake.js"
import { IcisClientStore } from "./adapters/icis.js"
import { buildApp } from "./app.js"
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
function icisStore(): ClientStore {
  const orgUrl = requireEnv("DYNAMICS_URL").replace(/\/$/, "")
  const msal = new ConfidentialClientApplication({
    auth: {
      clientId: requireEnv("AZURE_CLIENT_ID"),
      clientSecret: requireEnv("AZURE_CLIENT_SECRET"),
      authority: `https://login.microsoftonline.com/${requireEnv("AZURE_TENANT_ID")}`,
    },
  })
  return new IcisClientStore(orgUrl, async () => {
    const result = await msal.acquireTokenByClientCredential({
      scopes: [`${orgUrl}/.default`],
    })
    if (!result) throw new Error("No ICIS access token returned")
    return result.accessToken
  })
}

const adapter = process.env.ADAPTER ?? "fake"
const store = adapter === "icis" ? icisStore() : new FakeClientStore()
const app = buildApp(new BindingService(store), logger)

const port = Number(process.env.PORT ?? 3100)
app
  .listen({ port, host: "127.0.0.1" })
  .then(() => logger.info({ adapter }, "data binding service ready"))
  .catch((err: unknown) => {
    logger.error({ err }, "failed to start data binding service")
    process.exit(1)
  })
