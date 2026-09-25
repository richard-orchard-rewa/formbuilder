import { describe, expect, it } from "vitest"
import { StoreWriteError } from "./adapters/adapter.js"
import { FAKE_CLIENT_ID, FakeRecordStore, KNOWN_TITLES } from "./adapters/fake.js"
import { BindingCreator } from "./creator.js"
import { InMemoryIdentityRegistry } from "./identity.js"
import { BindingRegistry, InMemoryConfiguredBindingRepository } from "./registry.js"
import { AnchorNotFoundError, BindingService, UnknownBindingError } from "./service.js"

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
