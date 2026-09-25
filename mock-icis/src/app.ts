import Fastify from "fastify"
import { registerAdmin } from "./admin.js"
import { registerOData } from "./odata.js"
import { MockIcisState } from "./state.js"

// A mock ICIS for demonstrating data-bound fields end to end: a Dataverse
// Web API look-alike the Data Binding Service's real ICIS adapter can talk
// to unchanged, plus screens for the ICIS side of the story. Demo data only.
export function buildMockIcis(state = new MockIcisState()) {
  const app = Fastify()
  registerOData(app, state)
  registerAdmin(app, state)
  return { app, state }
}
