import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  IdentityRegistry,
  InMemoryIdentityRepository,
  JsonFileIdentityRepository,
  slugify,
} from "./identity.js"

const registry = () => new IdentityRegistry(new InMemoryIdentityRepository())

describe("anchor IDs", () => {
  it("issues one stable DBS ID per store record", async () => {
    const ids = registry()
    const first = await ids.anchorFor("client", "icis", "contact-guid-1")
    expect(await ids.anchorFor("client", "icis", "contact-guid-1")).toBe(first)
    expect(await ids.anchorFor("client", "icis", "contact-guid-2")).not.toBe(first)
    expect(first).not.toContain("contact-guid")
    expect(await ids.storeIdForAnchor(first, "icis")).toBe("contact-guid-1")
  })

  it("knows nothing about a store the record hasn't been linked to", async () => {
    const ids = registry()
    const id = await ids.anchorFor("client", "icis", "contact-guid-1")
    expect(await ids.storeIdForAnchor(id, "clients")).toBeNull()
    expect(await ids.storeIdForAnchor("not-an-anchor", "icis")).toBeNull()
  })
})

describe("option codes", () => {
  it("derives codes from labels, keeping them unique within a list", async () => {
    const ids = registry()
    expect(
      await ids.codesFor("csg_salutation", "icis", [
        { storeId: "a", label: "Mr" },
        { storeId: "b", label: "Not Stated" },
        { storeId: "c", label: "not stated" },
      ]),
    ).toEqual(["mr", "not-stated", "not-stated-2"])
  })

  it("keeps a row's code when its label changes", async () => {
    const ids = registry()
    await ids.codesFor("csg_salutation", "icis", [{ storeId: "a", label: "Mr" }])
    expect(
      await ids.codesFor("csg_salutation", "icis", [{ storeId: "a", label: "Mister" }]),
    ).toEqual(["mr"])
  })

  it("translates codes and store row IDs both ways", async () => {
    const ids = registry()
    await ids.codesFor("csg_gender", "icis", [{ storeId: "g1", label: "Female" }])
    expect(await ids.storeIdForCode("csg_gender", "icis", "female")).toBe("g1")
    expect(await ids.codeForStoreId("csg_gender", "icis", "g1")).toBe("female")
    expect(await ids.storeIdForCode("csg_gender", "icis", "nope")).toBeNull()
  })

  it("slugifies labels", () => {
    expect(slugify("Prefer not to say")).toBe("prefer-not-to-say")
    expect(slugify("Mx.")).toBe("mx")
    expect(slugify("??")).toBe("option")
  })
})

describe("JsonFileIdentityRepository", () => {
  let dir: string | undefined
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("persists identities across registry instances", async () => {
    dir = await mkdtemp(join(tmpdir(), "dbs-id-"))
    const path = join(dir, "identity.json")
    const first = new IdentityRegistry(new JsonFileIdentityRepository(path))
    const id = await first.anchorFor("client", "icis", "contact-guid-1")
    await first.codesFor("csg_salutation", "icis", [{ storeId: "a", label: "Mr" }])

    const second = new IdentityRegistry(new JsonFileIdentityRepository(path))
    expect(await second.anchorFor("client", "icis", "contact-guid-1")).toBe(id)
    expect(await second.storeIdForCode("csg_salutation", "icis", "mr")).toBe("a")
  })

  it("doesn't lose concurrently issued IDs", async () => {
    dir = await mkdtemp(join(tmpdir(), "dbs-id-"))
    const ids = new IdentityRegistry(new JsonFileIdentityRepository(join(dir, "i.json")))
    const issued = await Promise.all(
      Array.from({ length: 10 }, (_, i) => ids.anchorFor("client", "icis", `c${i}`)),
    )
    for (let i = 0; i < 10; i++) {
      expect(await ids.storeIdForAnchor(issued[i], "icis")).toBe(`c${i}`)
    }
  })
})
