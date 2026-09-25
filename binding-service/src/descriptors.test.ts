import { describe, expect, it } from "vitest"
import { FAKE_CLIENT_ID, FakeRecordStore, KNOWN_TITLES } from "./adapters/fake.js"
import { BindingCreator, BindingRuleError } from "./creator.js"
import { IdentityRegistry, InMemoryIdentityRepository } from "./identity.js"
import { BindingRegistry, InMemoryConfiguredBindingRepository } from "./registry.js"
import { BindingService } from "./service.js"

function build() {
  const store = new FakeRecordStore()
  const registry = new BindingRegistry(new InMemoryConfiguredBindingRepository())
  const service = new BindingService(
    store,
    registry,
    new IdentityRegistry(new InMemoryIdentityRepository()),
  )
  return { store, service, creator: new BindingCreator(store, registry) }
}

const bob = async (service: BindingService) => ({
  client: (await service.findClient("00152076"))!.id,
})

describe("self-describing descriptors", () => {
  it("tell a consumer how to show, list, check, read and write a lookup", async () => {
    const { service } = build()
    expect(await service.getBinding("client.title")).toMatchObject({
      presentations: { allowed: ["dropdown", "radio"], default: "dropdown" },
      options: { href: "/bindings/client.title/options", allowBlank: true },
      validation: { required: false, rules: [{ type: "oneOfOptions" }] },
      operations: {
        resolve: { href: "/resolve" },
        commit: { href: "/commit", strategy: "lookup" },
      },
    })
  })

  it("describe a text binding's length limit as a rule, with no options", async () => {
    const descriptor = await build().service.getBinding("client.firstName")
    expect(descriptor.presentations).toEqual({ allowed: ["text"], default: "text" })
    expect(descriptor.validation?.rules).toEqual([{ type: "maxLength", value: 50 }])
    expect(descriptor.options).toBeUndefined()
  })
})

describe("validation at commit", () => {
  it("refuses a lookup value that isn't one of the options, without writing", async () => {
    const { service, store } = build()
    const anchor = await bob(service)
    const { results } = await service.commit({
      anchor,
      values: { "client.title": "duke" },
    })
    expect(results["client.title"]).toEqual({
      status: "failed",
      message: "Not one of the allowed options",
    })
    const record = await store.read("contact", FAKE_CLIENT_ID, [
      { strategy: "lookup", entity: "contact", attribute: "csg_salutationid" },
    ])
    expect(record?.values.csg_salutationid).toBe(KNOWN_TITLES[1].value)
  })

  it("accepts one of the options", async () => {
    const { service } = build()
    const { results } = await service.commit({
      anchor: await bob(service),
      values: { "client.title": "ms" },
    })
    expect(results["client.title"]).toEqual({ status: "written" })
  })

  it("refuses to clear a value the store requires", async () => {
    const { store, service, creator } = build()
    const anchor = await bob(service)
    // Pretend ICIS requires a gender, so the binding inherits that.
    const describe = store.describe.bind(store)
    store.describe = async (entity, attributes) =>
      (await describe(entity, attributes)).map((m) =>
        m.attribute === "csg_genderid" ? { ...m, requiredLevel: "required" } : m,
      )
    await creator.saveDraft({
      key: "client.gender",
      label: "Gender",
      description: "",
      attribute: "csg_genderid",
      access: "readWrite",
    })
    await creator.publish("client.gender")
    expect((await service.getBinding("client.gender")).validation?.required).toBe(true)

    const female = (await service.getOptions("client.gender")).options[0].value
    await service.commit({ anchor, values: { "client.gender": female } })

    const { results } = await service.commit({ anchor, values: { "client.gender": "" } })
    expect(results["client.gender"]).toEqual({
      status: "failed",
      message: "A value is required here",
    })
  })
})

describe("presentations in the binding creator", () => {
  const gender = {
    key: "client.gender",
    label: "Gender",
    description: "",
    attribute: "csg_genderid",
    access: "readWrite" as const,
  }

  it("offers dropdown and radio for a lookup, text for an attribute", async () => {
    const candidates = await build().creator.candidates("client")
    expect(candidates.find((c) => c.attribute === "csg_genderid")?.presentations).toEqual([
      "dropdown",
      "radio",
    ])
    expect(candidates.find((c) => c.attribute === "csg_alias")?.presentations).toEqual(["text"])
  })

  it("lets a steward narrow them, the first listed becoming the default", async () => {
    const { creator, service } = build()
    await creator.saveDraft({ ...gender, presentations: ["radio"] })
    await creator.publish("client.gender")
    expect((await service.getBinding("client.gender")).presentations).toEqual({
      allowed: ["radio"],
      default: "radio",
    })
  })

  it("refuses a presentation the strategy can't support", async () => {
    const { creator } = build()
    await expect(creator.saveDraft({ ...gender, presentations: ["text"] })).rejects.toThrow(
      BindingRuleError,
    )
  })
})
