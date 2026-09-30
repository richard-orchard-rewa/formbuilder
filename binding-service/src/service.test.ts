import { describe, expect, it } from "vitest"
import { StoreWriteError } from "./adapters/adapter.js"
import {
  FAKE_ATTENDANCE_IDS,
  FAKE_CASE_ID,
  FAKE_CLIENT_ID,
  FakeRecordStore,
  KNOWN_TITLES,
} from "./adapters/fake.js"
import { BindingCreator } from "./creator.js"
import { InMemoryIdentityRegistry } from "./identity.js"
import { BindingRegistry, InMemoryConfiguredBindingRepository } from "./registry.js"
import {
  AnchorMismatchError,
  AnchorNotFoundError,
  BindingService,
  UnknownBindingError,
} from "./service.js"

// Titles by code, as the DBS presents them.
const MR = "mr"
const MS = "ms"

// Consumers only ever see DBS anchor IDs, got by finding the client.
async function build() {
  const store = new FakeRecordStore()
  const registry = new BindingRegistry(new InMemoryConfiguredBindingRepository())
  const identities = new InMemoryIdentityRegistry()
  const service = new BindingService(store, registry, identities)
  const found = await service.findClient("00152076")
  return {
    store,
    identities,
    service,
    creator: new BindingCreator(store, registry),
    anchor: { client: found!.id },
  }
}

const read = (store: FakeRecordStore, attribute: string) =>
  store
    .read("contact", FAKE_CLIENT_ID, [{ strategy: "attribute", entity: "contact", attribute }])
    .then((r) => r?.values[attribute])

describe("BindingService dictionary", () => {
  it("describes every built-in client binding, including which are read-only", async () => {
    const { service } = await build()
    const bindings = await service.listBindings("client")
    expect(bindings.map((b) => [b.key, b.access])).toEqual([
      ["client.title", "readWrite"],
      ["client.firstName", "readWrite"],
      ["client.lastName", "readWrite"],
      ["client.clientNumber", "read"],
    ])
  })

  it("serves options by code, never the store's row IDs", async () => {
    const { service } = await build()
    expect((await service.getOptions("client.title")).options).toEqual(
      KNOWN_TITLES.map((t) => ({ value: t.label.toLowerCase().replace(" ", "-"), label: t.label })),
    )
    await expect(service.getOptions("client.firstName")).rejects.toThrow()
  })

  it("finds a client by client number, under a DBS-issued ID that stays the same", async () => {
    const { service, anchor } = await build()
    const found = await service.findClient("00152076")
    expect(found).toEqual({
      id: anchor.client,
      clientNumber: "00152076",
      displayName: "Bob McGee",
    })
    expect(found?.id).not.toBe(FAKE_CLIENT_ID)
    expect(await service.findClient("99999999")).toBeNull()
  })

  it("refuses the store's own record ID as an anchor", async () => {
    const { service } = await build()
    await expect(
      service.resolve({ anchor: { client: FAKE_CLIENT_ID }, bindings: ["client.firstName"] }),
    ).rejects.toThrow(AnchorNotFoundError)
  })

  it("includes a configured binding only once it's published", async () => {
    const { service, creator } = await build()
    await creator.saveDraft({
      key: "client.preferredName",
      label: "Preferred name",
      description: "",
      attribute: "csg_alias",
      access: "readWrite",
    })
    expect((await service.listBindings()).map((b) => b.key)).not.toContain(
      "client.preferredName",
    )
    await creator.publish("client.preferredName")
    expect((await service.listBindings()).map((b) => b.key)).toContain(
      "client.preferredName",
    )
  })
})

describe("BindingService.resolve", () => {
  it("returns current values keyed by binding", async () => {
    const { service, anchor } = await build()
    const { values } = await service.resolve({
      anchor,
      bindings: ["client.title", "client.firstName", "client.clientNumber"],
    })
    expect(values).toEqual({
      "client.title": MR,
      "client.firstName": "Bob",
      "client.clientNumber": "00152076",
    })
  })

  it("rejects unknown bindings and unknown clients", async () => {
    const { service, anchor } = await build()
    await expect(
      service.resolve({ anchor, bindings: ["client.shoeSize"] }),
    ).rejects.toThrow(UnknownBindingError)
    await expect(
      service.resolve({
        anchor: { client: "11111111-1111-1111-1111-111111111111" },
        bindings: ["client.firstName"],
      }),
    ).rejects.toThrow(AnchorNotFoundError)
  })
})

describe("BindingService.commit", () => {
  it("writes only what changed and ignores read-only bindings", async () => {
    const { service, store, anchor } = await build()
    const { results } = await service.commit({
      anchor,
      values: {
        "client.title": MS,
        "client.firstName": "Bob",
        "client.lastName": "  McGee-Smith ",
        "client.clientNumber": "123",
      },
    })
    expect(results).toEqual({
      "client.title": { status: "written" },
      "client.firstName": { status: "unchanged" },
      "client.lastName": { status: "written" },
      "client.clientNumber": { status: "readOnly" },
    })
    expect(await read(store, "lastname")).toBe("McGee-Smith")
    expect(await read(store, "csg_clientid")).toBe("00152076")
  })

  it("reports a conflict instead of overwriting a value changed since the form was opened", async () => {
    const { service, store, anchor } = await build()
    await service.commit({ anchor, values: { "client.firstName": "Robert" } })

    const { results } = await service.commit({
      anchor,
      values: { "client.firstName": "Bobby", "client.lastName": "Magee" },
      baseline: { "client.firstName": "Bob", "client.lastName": "McGee" },
    })
    expect(results["client.firstName"]).toMatchObject({
      status: "conflict",
      current: "Robert",
    })
    expect(results["client.lastName"]).toEqual({ status: "written" })
    expect(await read(store, "firstname")).toBe("Robert")
  })

  it("re-checks a binding's length limit at the API boundary", async () => {
    const { service, store, anchor } = await build()
    const { results } = await service.commit({
      anchor,
      values: { "client.firstName": "x".repeat(51) },
    })
    expect(results["client.firstName"].status).toBe("failed")
    expect(await read(store, "firstname")).toBe("Bob")
  })

  it("writes a configured binding through its strategy", async () => {
    const { service, creator, store, anchor } = await build()
    await creator.saveDraft({
      key: "client.preferredName",
      label: "Preferred name",
      description: "",
      attribute: "csg_alias",
      access: "readWrite",
      maxLength: 20,
    })
    await creator.publish("client.preferredName")

    const { results } = await service.commit({
      anchor,
      values: { "client.preferredName": "Bobbo" },
    })
    expect(results["client.preferredName"]).toEqual({ status: "written" })
    expect(await read(store, "csg_alias")).toBe("Bobbo")
  })

  it("treats blank text as clearing the value", async () => {
    const { service, store, anchor } = await build()
    await service.commit({ anchor, values: { "client.title": "" } })
    const record = await store.read("contact", FAKE_CLIENT_ID, [
      { strategy: "lookup", entity: "contact", attribute: "csg_salutationid" },
    ])
    expect(record?.values.csg_salutationid).toBeNull()
  })

  it("marks every pending write failed when the store refuses it", async () => {
    const { service, store, anchor } = await build()
    store.write = async () => {
      throw new StoreWriteError("no write privilege")
    }
    const { results } = await service.commit({
      anchor,
      values: { "client.firstName": "Bobby", "client.lastName": "McGee" },
    })
    expect(results).toEqual({
      "client.firstName": { status: "failed", message: "no write privilege" },
      "client.lastName": { status: "unchanged" },
    })
  })
})

describe("BindingService sessions and participants", () => {
  const attendanceOf = (store: FakeRecordStore, attendanceId: string) =>
    store
      .read("csg_attendance", attendanceId, [
        { strategy: "choice", entity: "csg_attendance", attribute: "wp_attendancestatus" },
      ])
      .then((r) => r?.values.wp_attendancestatus)

  it("lists a client's sessions with everyone in them, all under DBS anchor IDs", async () => {
    const { service, anchor } = await build()
    const sessions = await service.findSessions("00152076")
    expect(sessions).toHaveLength(1)
    const [session] = sessions!
    expect(session.subject).toBe("Joint session")
    expect(session.participants.map((p) => [p.client.displayName, p.attendance])).toEqual([
      ["Bob McGee", "Attended"],
      ["Alex Rivera", "Invited"],
    ])
    // The same client anchor as finding the client directly.
    expect(session.participants[0].client.id).toBe(anchor.client)
    // Nothing from the store leaks through.
    expect(JSON.stringify(sessions)).not.toContain(FAKE_ATTENDANCE_IDS[0])
    expect(await service.findSessions("99999999")).toBeNull()
  })

  it("resolves session details against the session anchor", async () => {
    const { service } = await build()
    const [session] = (await service.findSessions("00152076"))!
    const { values } = await service.resolve({
      anchor: { session: session.id },
      bindings: ["session.subject", "session.start"],
    })
    expect(values).toEqual({
      "session.subject": "Joint session",
      "session.start": "2026-10-06T02:00:00Z",
    })
  })

  it("reads and writes each participant's own attendance, never another's", async () => {
    const { service, store } = await build()
    const [session] = (await service.findSessions("00152076"))!
    const [bob, alex] = session.participants
    const attendance = async (participant: string) =>
      (
        await service.resolve({
          anchor: { participant },
          bindings: ["participant.attendance"],
        })
      ).values["participant.attendance"]

    expect(await attendance(bob.id)).toBe("attended")
    expect(await attendance(alex.id)).toBe("invited")

    const { results } = await service.commit({
      anchor: { participant: alex.id },
      values: { "participant.attendance": "dna" },
      baseline: { "participant.attendance": "invited" },
    })
    expect(results["participant.attendance"]).toEqual({ status: "written" })
    // Written back to Alex's attendance row (the option's integer), and
    // read back for Alex only.
    expect(await attendanceOf(store, FAKE_ATTENDANCE_IDS[1])).toBe("2")
    expect(await attendanceOf(store, FAKE_ATTENDANCE_IDS[0])).toBe("4")
    expect(await attendance(alex.id)).toBe("dna")
    expect(await attendance(bob.id)).toBe("attended")
  })

  it("says who a participant anchor is, so saved per-participant data is shown against the right person", async () => {
    const { service } = await build()
    const [session] = (await service.findSessions("00152076"))!
    const [bob, alex] = session.participants
    expect(await service.getParticipant(alex.id)).toEqual(alex)
    expect(await service.getParticipant(bob.id)).toEqual(bob)
    // A client's anchor isn't a participant's.
    expect(await service.getParticipant(bob.client.id)).toBeNull()
  })

  it("serves a choice binding's options by code", async () => {
    const { service } = await build()
    expect((await service.getOptions("participant.attendance")).options).toEqual([
      { value: "invited", label: "Invited" },
      { value: "dna", label: "DNA" },
      { value: "attended", label: "Attended" },
    ])
  })

  it("refuses bindings asked for against the wrong kind of anchor", async () => {
    const { service, anchor } = await build()
    await expect(
      service.resolve({ anchor, bindings: ["participant.attendance"] }),
    ).rejects.toBeInstanceOf(AnchorMismatchError)
    // A client's anchor ID isn't accepted as a participant's.
    await expect(
      service.resolve({
        anchor: { participant: anchor.client },
        bindings: ["participant.attendance"],
      }),
    ).rejects.toBeInstanceOf(AnchorNotFoundError)
  })
})

describe("BindingService case anchors", () => {
  it("opens a case by number: its clients and sessions, as DBS anchors only", async () => {
    const { service } = await build()
    const found = (await service.findCase("100001"))!
    expect(found).toMatchObject({ caseNumber: "100001", displayName: "McGee & Rivera — Mediation" })
    expect(found.clients.map((c) => c.displayName)).toEqual(["Bob McGee", "Alex Rivera"])
    expect(found.sessions.map((s) => s.subject)).toEqual(["Joint session"])
    expect(found.sessions[0].participants.map((p) => p.client.displayName)).toEqual([
      "Bob McGee",
      "Alex Rivera",
    ])
    expect(found.id).not.toBe(FAKE_CASE_ID)
    expect(await service.findCase("999999")).toBeNull()
  })

  it("resolves case bindings on the case anchor, and only there", async () => {
    const { service, anchor } = await build()
    const found = (await service.findCase("100001"))!
    const { values } = await service.resolve({ anchor: { case: found.id }, bindings: ["case.caseNumber"] })
    expect(values).toEqual({ "case.caseNumber": "100001" })
    await expect(service.resolve({ anchor, bindings: ["case.caseNumber"] })).rejects.toThrow(
      AnchorMismatchError,
    )
    // A client's anchor ID isn't a case's.
    await expect(
      service.resolve({ anchor: { case: anchor.client }, bindings: ["case.caseNumber"] }),
    ).rejects.toThrow(AnchorNotFoundError)
  })
})
