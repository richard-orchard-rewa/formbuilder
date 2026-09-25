import { describe, expect, it } from "vitest"
// The Data Binding Service's real ICIS adapter and services, run against the
// mock: proves the mock speaks the Dataverse subset the adapter relies on,
// and walks the demo's whole story in-process.
import { IcisRecordStore } from "../../binding-service/src/adapters/icis.js"
import { BindingCreator } from "../../binding-service/src/creator.js"
import {
  BindingRegistry,
  InMemoryConfiguredBindingRepository,
} from "../../binding-service/src/registry.js"
import { BindingService } from "../../binding-service/src/service.js"
import { buildMockIcis } from "./app.js"
import { LOOKUP_ROWS, SERVICE_ACCOUNT } from "./data.js"

const BOB = "2c616f0e-d741-f011-8779-000d3ad0ea14"
const ORG = "http://mock-icis"

function build() {
  const { app, state } = buildMockIcis()
  // Route the adapter's fetches into the mock in-process.
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const res = await app.inject({
      method: (init.method ?? "GET") as "GET",
      url: url.slice(ORG.length),
      headers: init.headers as Record<string, string>,
      payload: init.body as string | undefined,
    })
    return new Response(res.statusCode === 204 ? null : res.body, {
      status: res.statusCode,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
  const store = new IcisRecordStore(ORG, async () => SERVICE_ACCOUNT.token, fetchImpl, 0)
  const registry = new BindingRegistry(new InMemoryConfiguredBindingRepository())
  return {
    state,
    service: new BindingService(store, registry),
    creator: new BindingCreator(store, registry),
  }
}

const gender = (name: string) => LOOKUP_ROWS.csg_gender.find((r) => r.name === name)!.id

describe("the Data Binding Service against the mock ICIS", () => {
  it("finds a client and resolves built-in bindings", async () => {
    const { service } = build()
    expect(await service.findClient("00152078")).toMatchObject({ displayName: "Minh Tran" })
    const { values } = await service.resolve({
      anchor: { client: BOB },
      bindings: ["client.title", "client.firstName", "client.clientNumber"],
    })
    expect(values).toEqual({
      "client.title": "8a8b6ce9-e68f-df11-aff9-0050569f692b",
      "client.firstName": "Bob",
      "client.clientNumber": "00152076",
    })
    expect((await service.getOptions("client.title")).source).toBe("live")
  })

  it("starts read-only: every attribute capped at display-only, lookups blocked", async () => {
    const { creator } = build()
    const candidates = await creator.candidates("client")
    expect(candidates.every((c) => c.maxAccess === "read")).toBe(true)
    const genderCandidate = candidates.find((c) => c.attribute === "csg_genderid")
    expect(genderCandidate?.problems.join(" ")).toContain("csg_gender")
    // Sensitive columns the mock holds never reach the creator.
    expect(candidates.map((c) => c.attribute)).not.toContain("csg_dssid")
  })

  it("refuses a write the account isn't allowed, with the missing privilege named", async () => {
    const { service } = build()
    const { results } = await service.commit({
      anchor: { client: BOB },
      values: { "client.firstName": "Robert" },
    })
    expect(results["client.firstName"]).toMatchObject({
      status: "failed",
      message: expect.stringContaining("prvWriteContact"),
    })
  })

  it("walks the demo: grant privileges, create and publish bindings, save back, hit a conflict", async () => {
    const { state, service, creator } = build()

    // ICIS admin grants the service what it needs.
    for (const p of [
      "prvWriteContact",
      "prvAppendContact",
      "prvReadCsg_gender",
      "prvAppendToCsg_gender",
    ]) {
      state.privileges.add(p)
    }

    // Data steward creates and publishes two bindings.
    await creator.saveDraft({
      key: "client.preferredName",
      label: "Preferred name",
      description: "",
      attribute: "csg_alias",
      access: "readWrite",
      maxLength: 60,
    })
    await creator.publish("client.preferredName")
    await creator.saveDraft({
      key: "client.gender",
      label: "Gender",
      description: "",
      attribute: "csg_genderid",
      access: "readWrite",
    })
    await creator.publish("client.gender")
    expect((await service.getOptions("client.gender")).options.map((o) => o.label)).toContain(
      "Non-binary",
    )

    // Practitioner opens a form for Minh Tran, edits, submits.
    const minh = (await service.findClient("00152078"))!.id
    const opened = await service.resolve({
      anchor: { client: minh },
      bindings: ["client.preferredName", "client.gender"],
    })
    expect(opened.values["client.preferredName"]).toBe("Tony")
    const saved = await service.commit({
      anchor: { client: minh },
      values: { "client.preferredName": "Tony T", "client.gender": gender("Male") },
      baseline: opened.values,
    })
    expect(saved.results).toEqual({
      "client.preferredName": { status: "written" },
      "client.gender": { status: "unchanged" },
    })
    expect(state.contacts.get(minh)?.values.csg_alias).toBe("Tony T")

    // Meanwhile, reception changes the preferred name in ICIS...
    const reopened = await service.resolve({
      anchor: { client: minh },
      bindings: ["client.preferredName"],
    })
    state.updateAsStaff(minh, { csg_alias: "Anthony" })
    // ...so the practitioner's stale edit is reported, not written.
    const stale = await service.commit({
      anchor: { client: minh },
      values: { "client.preferredName": "Tone" },
      baseline: reopened.values,
    })
    expect(stale.results["client.preferredName"]).toMatchObject({
      status: "conflict",
      current: "Anthony",
    })
    expect(state.contacts.get(minh)?.values.csg_alias).toBe("Anthony")

    // Every call went through the Web API, and was logged.
    expect(state.log.some((e) => e.method === "PATCH" && e.status === 204)).toBe(true)
  })

  it("rejects requests without the service account's token", async () => {
    const { app } = buildMockIcis()
    const res = await app.inject({ url: "/api/data/v9.2/WhoAmI" })
    expect(res.statusCode).toBe(401)
  })
})

describe("the creator's ceiling for lookups", () => {
  it("won't offer an editable lookup until the account can link to the list", async () => {
    const { state, creator } = build()
    state.privileges.add("prvWriteContact")
    state.privileges.add("prvReadCsg_gender")
    const before = (await creator.candidates("client")).find((c) => c.attribute === "csg_genderid")
    expect(before?.maxAccess).toBe("read")
    expect(before?.accessNotes.join(" ")).toContain("Append To")

    state.privileges.add("prvAppendContact")
    state.privileges.add("prvAppendToCsg_gender")
    const after = (await creator.candidates("client")).find((c) => c.attribute === "csg_genderid")
    expect(after?.maxAccess).toBe("readWrite")
  })
})

describe("validation against the mock's live lists", () => {
  it("refuses a title that isn't in ICIS's salutation list, and never sends the PATCH", async () => {
    const { state, service } = build()
    state.privileges.add("prvWriteContact")
    state.privileges.add("prvAppendContact")
    state.privileges.add("prvAppendToCsg_salutation")
    const { results } = await service.commit({
      anchor: { client: BOB },
      values: { "client.title": "de301000-0000-4000-8000-000000000999" },
    })
    expect(results["client.title"]).toMatchObject({ message: "Not one of the allowed options" })
    expect(state.log.some((e) => e.method === "PATCH")).toBe(false)

    const mx = LOOKUP_ROWS.csg_salutation.find((r) => r.name === "Mx")!.id
    const ok = await service.commit({ anchor: { client: BOB }, values: { "client.title": mx } })
    expect(ok.results["client.title"]).toEqual({ status: "written" })
  })
})
