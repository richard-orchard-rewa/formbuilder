import { describe, expect, it } from "vitest"
import { StoreWriteError } from "./adapters/adapter.js"
import { FAKE_CLIENT_ID, FakeClientStore, KNOWN_TITLES } from "./adapters/fake.js"
import { AnchorNotFoundError, BindingService, UnknownBindingError } from "./service.js"

const anchor = { client: FAKE_CLIENT_ID }
const MR = KNOWN_TITLES[1].value
const MS = KNOWN_TITLES[3].value

function build() {
  const store = new FakeClientStore()
  return { store, service: new BindingService(store) }
}

describe("BindingService dictionary", () => {
  it("describes every client binding, including which are read-only", () => {
    const { service } = build()
    const bindings = service.listBindings("client")
    expect(bindings.map((b) => [b.key, b.access])).toEqual([
      ["client.title", "readWrite"],
      ["client.firstName", "readWrite"],
      ["client.lastName", "readWrite"],
      ["client.clientNumber", "read"],
    ])
  })

  it("serves options only for lookup bindings", async () => {
    const { service } = build()
    expect((await service.getOptions("client.title")).options).toEqual(KNOWN_TITLES)
    await expect(service.getOptions("client.firstName")).rejects.toThrow()
  })

  it("finds a client by client number", async () => {
    const { service } = build()
    expect(await service.findClient("00152076")).toEqual({
      id: FAKE_CLIENT_ID,
      clientNumber: "00152076",
      displayName: "Bob McGee",
    })
    expect(await service.findClient("99999999")).toBeNull()
  })
})

describe("BindingService.resolve", () => {
  it("returns current values keyed by binding", async () => {
    const { service } = build()
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
    const { service } = build()
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
    const { service, store } = build()
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
    expect((await store.get(FAKE_CLIENT_ID))?.record).toMatchObject({
      titleId: MS,
      lastName: "McGee-Smith",
      clientNumber: "00152076",
    })
  })

  it("reports a conflict instead of overwriting a value changed since the form was opened", async () => {
    const { service, store } = build()
    await store.update(FAKE_CLIENT_ID, { firstName: "Robert" }, "1")

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
    expect((await store.get(FAKE_CLIENT_ID))?.record.firstName).toBe("Robert")
  })

  it("treats blank text as clearing the value", async () => {
    const { service, store } = build()
    await service.commit({ anchor, values: { "client.title": "" } })
    expect((await store.get(FAKE_CLIENT_ID))?.record.titleId).toBeNull()
  })

  it("marks every pending write failed when the store refuses it", async () => {
    const { service, store } = build()
    store.update = async () => {
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
