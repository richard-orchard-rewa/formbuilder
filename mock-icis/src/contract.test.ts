import { describe, expect, it } from "vitest"
// The Data Binding Service's real ICIS adapter and services, run against the
// mock: proves the mock speaks the Dataverse subset the adapter relies on,
// and walks the demo's whole story in-process.
import { IcisRecordStore } from "../../binding-service/src/adapters/icis.js"
import { BindingCreator } from "../../binding-service/src/creator.js"
import { InMemoryIdentityRegistry } from "../../binding-service/src/identity.js"
import {
  BindingRegistry,
  InMemoryConfiguredBindingRepository,
} from "../../binding-service/src/registry.js"
import { BindingService } from "../../binding-service/src/service.js"
import { buildMockIcis } from "./app.js"
import { LOOKUP_ROWS, SERVICE_ACCOUNT } from "./data.js"

// Contacts' Dataverse IDs, as the mock holds them. Consumers never see these.
const BOB = "2c616f0e-d741-f011-8779-000d3ad0ea14"
const MINH_RECORD = "de300000-0000-4000-8000-000000152078"
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
  const identities = new InMemoryIdentityRegistry()
  const service = new BindingService(store, registry, identities)
  return {
    state,
    identities,
    service,
    creator: new BindingCreator(store, registry),
    // Consumers anchor on DBS IDs, got by finding the client.
    anchorOf: async (clientNumber: string) => ({
      client: (await service.findClient(clientNumber))!.id,
    }),
  }
}


describe("the Data Binding Service against the mock ICIS", () => {
  it("finds a client and resolves built-in bindings, in DBS terms only", async () => {
    const { service, anchorOf } = build()
    const minh = await service.findClient("00152078")
    expect(minh).toMatchObject({ displayName: "Minh Tran" })
    // The anchor is the DBS's own ID, not the contact's Dataverse GUID.
    expect(minh?.id).not.toBe(MINH_RECORD)
    const { values } = await service.resolve({
      anchor: await anchorOf("00152076"),
      bindings: ["client.title", "client.firstName", "client.clientNumber"],
    })
    expect(values).toEqual({
      // A code, not the salutation row's Dataverse GUID.
      "client.title": "mr",
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
    const { service, anchorOf } = build()
    const { results } = await service.commit({
      anchor: await anchorOf("00152076"),
      values: { "client.firstName": "Robert" },
    })
    expect(results["client.firstName"]).toMatchObject({
      status: "failed",
      message: expect.stringContaining("prvWriteContact"),
    })
  })

  it("walks the demo: grant privileges, create and publish bindings, save back, hit a conflict", async () => {
    const { state, service, creator, anchorOf } = build()

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
    const minh = await anchorOf("00152078")
    const opened = await service.resolve({
      anchor: minh,
      bindings: ["client.preferredName", "client.gender"],
    })
    expect(opened.values["client.preferredName"]).toBe("Tony")
    expect(opened.values["client.gender"]).toBe("male")
    const saved = await service.commit({
      anchor: minh,
      values: { "client.preferredName": "Tony T", "client.gender": "male" },
      baseline: opened.values,
    })
    expect(saved.results).toEqual({
      "client.preferredName": { status: "written" },
      "client.gender": { status: "unchanged" },
    })
    expect(state.contacts.get(MINH_RECORD)?.values.csg_alias).toBe("Tony T")

    // Meanwhile, reception changes the preferred name in ICIS...
    const reopened = await service.resolve({
      anchor: minh,
      bindings: ["client.preferredName"],
    })
    state.updateAsStaff(MINH_RECORD, { csg_alias: "Anthony" })
    // ...so the practitioner's stale edit is reported, not written.
    const stale = await service.commit({
      anchor: minh,
      values: { "client.preferredName": "Tone" },
      baseline: reopened.values,
    })
    expect(stale.results["client.preferredName"]).toMatchObject({
      status: "conflict",
      current: "Anthony",
    })
    expect(state.contacts.get(MINH_RECORD)?.values.csg_alias).toBe("Anthony")

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
    const { state, service, anchorOf } = build()
    state.privileges.add("prvWriteContact")
    state.privileges.add("prvAppendContact")
    state.privileges.add("prvAppendToCsg_salutation")
    const bob = await anchorOf("00152076")
    // A store row ID is not a valid value either: only codes are.
    for (const value of ["duke", LOOKUP_ROWS.csg_salutation[0].id]) {
      const { results } = await service.commit({ anchor: bob, values: { "client.title": value } })
      expect(results["client.title"]).toMatchObject({ message: "Not one of the allowed options" })
    }
    expect(state.log.some((e) => e.method === "PATCH")).toBe(false)

    const ok = await service.commit({ anchor: bob, values: { "client.title": "mx" } })
    expect(ok.results["client.title"]).toEqual({ status: "written" })
    // ...and ICIS got the Mx row's own ID.
    const mxRow = LOOKUP_ROWS.csg_salutation.find((r) => r.name === "Mx")!.id
    expect(state.contacts.get(BOB)?.values.csg_salutationid).toBe(mxRow)
  })
})
