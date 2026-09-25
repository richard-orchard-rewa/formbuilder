import { describe, expect, it } from "vitest"
import { FakeRecordStore } from "./adapters/fake.js"
import { BindingCreator, BindingRuleError } from "./creator.js"
import { BindingRegistry, InMemoryConfiguredBindingRepository } from "./registry.js"

function build(privileges?: ConstructorParameters<typeof FakeRecordStore>[0]) {
  const store = new FakeRecordStore(privileges)
  const registry = new BindingRegistry(new InMemoryConfiguredBindingRepository())
  return { store, registry, creator: new BindingCreator(store, registry) }
}

const preferredName = {
  key: "client.preferredName",
  label: "Preferred name",
  description: "What the client likes to be called.",
  attribute: "csg_alias",
  access: "readWrite" as const,
}

describe("BindingCreator.candidates", () => {
  it("offers only allow-listed attributes, with the store's own limits", async () => {
    const { creator } = build()
    const candidates = await creator.candidates("client")
    const alias = candidates.find((c) => c.attribute === "csg_alias")
    expect(alias).toMatchObject({
      displayName: "Preferred Name",
      strategy: "attribute",
      maxLength: 100,
      maxAccess: "readWrite",
      problems: [],
      boundBy: null,
    })
    expect(candidates.map((c) => c.attribute)).not.toContain("adx_identity_passwordhash")
    expect(candidates.find((c) => c.attribute === "firstname")?.boundBy).toBe(
      "client.firstName",
    )
  })

  it("caps access at read when the allow-list, or the DBS account, says so", async () => {
    const { creator } = build({ writeEntity: false, readableTargets: new Set() })
    const candidates = await creator.candidates("client")
    const alias = candidates.find((c) => c.attribute === "csg_alias")!
    expect(alias.maxAccess).toBe("read")
    expect(alias.accessNotes.join(" ")).toContain("can't write client records")
    expect(candidates.find((c) => c.attribute === "csg_clientid")?.accessNotes).toContain(
      "The allow-list makes this display-only.",
    )
  })

  it("flags a lookup whose options the DBS account can't read", async () => {
    const { creator } = build()
    const language = (await creator.candidates("client")).find(
      (c) => c.attribute === "csg_home_languageid",
    )
    expect(language?.strategy).toBe("lookup")
    expect(language?.problems.join(" ")).toContain("can't read the csg_language list")
  })
})

describe("BindingCreator.saveDraft / publish", () => {
  it("derives the control from store metadata and publishes an immutable v1", async () => {
    const { creator } = build()
    const draft = await creator.saveDraft({ ...preferredName, maxLength: 40 })
    expect(draft.versions).toEqual([
      expect.objectContaining({
        version: 1,
        status: "draft",
        descriptor: expect.objectContaining({
          control: { kind: "text", maxLength: 40 },
          overridable: ["label", "required"],
        }),
      }),
    ])
    const published = await creator.publish("client.preferredName")
    expect(published.versions[0].status).toBe("published")
  })

  it("starts a new draft version after publishing, leaving v1 untouched", async () => {
    const { creator } = build()
    await creator.saveDraft(preferredName)
    await creator.publish("client.preferredName")
    const next = await creator.saveDraft({ ...preferredName, label: "Known as" })
    expect(next.versions.map((v) => [v.version, v.status, v.descriptor.label])).toEqual([
      [1, "published", "Preferred name"],
      [2, "draft", "Known as"],
    ])
  })

  it.each([
    [{ key: "preferredName" }, "camelCase"],
    [{ key: "client.firstName" }, "built-in"],
    [{ attribute: "adx_identity_passwordhash" }, "allow-list"],
    [{ attribute: "firstname", key: "client.givenName" }, "already bound"],
    [{ maxLength: 101 }, "at most 100"],
  ])("refuses %o (%s)", async (override, reason) => {
    const { creator } = build()
    await expect(creator.saveDraft({ ...preferredName, ...override })).rejects.toThrow(
      reason,
    )
  })

  it("refuses a writable binding the DBS account couldn't write, but allows it display-only", async () => {
    const { creator } = build({ writeEntity: false, readableTargets: new Set() })
    await expect(creator.saveDraft(preferredName)).rejects.toThrow("display-only")
    const draft = await creator.saveDraft({ ...preferredName, access: "read" })
    expect(draft.versions[0].descriptor.overridable).toEqual(["label"])
  })

  it("won't change the attribute behind an existing key", async () => {
    const { creator } = build()
    await creator.saveDraft(preferredName)
    await expect(
      creator.saveDraft({ ...preferredName, attribute: "middlename" }),
    ).rejects.toThrow("can't change")
  })

  it("re-checks the DBS account's privileges at publish time", async () => {
    const { creator, store } = build()
    await creator.saveDraft(preferredName)
    store.privileges.writeEntity = false
    await expect(creator.publish("client.preferredName")).rejects.toThrow(BindingRuleError)
  })

  it("won't publish a lookup whose options can't be read", async () => {
    const { creator } = build()
    await creator.saveDraft({
      key: "client.homeLanguage",
      label: "Home language",
      description: "",
      attribute: "csg_home_languageid",
      access: "readWrite",
    })
    await expect(creator.publish("client.homeLanguage")).rejects.toThrow("csg_language")
  })

  it("publishes a lookup whose options can be read", async () => {
    const { creator } = build()
    const draft = await creator.saveDraft({
      key: "client.gender",
      label: "Gender",
      description: "",
      attribute: "csg_genderid",
      access: "readWrite",
    })
    expect(draft.versions[0].descriptor.control).toEqual({ kind: "lookup" })
    await expect(creator.publish("client.gender")).resolves.toBeTruthy()
  })
})
