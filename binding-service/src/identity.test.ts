import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDb, type Db } from "./db/client.js"
import {
  InMemoryIdentityRegistry,
  PostgresIdentityRegistry,
  slugify,
  type IdentityRegistry,
} from "./identity.js"

// The same behaviour is required of every registry. The Postgres one runs
// only when BINDING_TEST_DATABASE_URL points at a migrated, disposable
// database (its tables are emptied), e.g.
//   BINDING_TEST_DATABASE_URL=postgresql://formbuilder:formbuilder@localhost:5432/binding_service_test
function registryContract(name: string, make: () => Promise<IdentityRegistry>) {
  describe(`${name}: anchor IDs`, () => {
    it("issues one stable DBS ID per store record", async () => {
      const ids = await make()
      const first = await ids.anchorFor("client", "icis", "contact-guid-1")
      expect(await ids.anchorFor("client", "icis", "contact-guid-1")).toBe(first)
      expect(await ids.anchorFor("client", "icis", "contact-guid-2")).not.toBe(first)
      expect(first).not.toContain("contact-guid")
      expect(await ids.storeIdForAnchor(first, "icis")).toBe("contact-guid-1")
    })

    it("knows nothing about a store the record hasn't been linked to", async () => {
      const ids = await make()
      const id = await ids.anchorFor("client", "icis", "contact-guid-1")
      expect(await ids.storeIdForAnchor(id, "clients")).toBeNull()
      expect(await ids.storeIdForAnchor("not-an-anchor", "icis")).toBeNull()
    })

    it("agrees on one ID when asked for the same record concurrently", async () => {
      const ids = await make()
      const issued = await Promise.all(
        Array.from({ length: 8 }, () => ids.anchorFor("client", "icis", "contact-race")),
      )
      expect(new Set(issued).size).toBe(1)
    })
  })

  describe(`${name}: option codes`, () => {
    it("derives codes from labels, keeping them unique within a list", async () => {
      const ids = await make()
      expect(
        await ids.codesFor("csg_salutation", "icis", [
          { storeId: "a", label: "Mr" },
          { storeId: "b", label: "Not Stated" },
          { storeId: "c", label: "not stated" },
        ]),
      ).toEqual(["mr", "not-stated", "not-stated-2"])
    })

    it("keeps a row's code when its label changes", async () => {
      const ids = await make()
      await ids.codesFor("csg_salutation", "icis", [{ storeId: "a", label: "Mr" }])
      expect(
        await ids.codesFor("csg_salutation", "icis", [{ storeId: "a", label: "Mister" }]),
      ).toEqual(["mr"])
    })

    it("translates codes and store row IDs both ways", async () => {
      const ids = await make()
      await ids.codesFor("csg_gender", "icis", [{ storeId: "g1", label: "Female" }])
      expect(await ids.storeIdForCode("csg_gender", "icis", "female")).toBe("g1")
      expect(await ids.codeForStoreId("csg_gender", "icis", "g1")).toBe("female")
      expect(await ids.storeIdForCode("csg_gender", "icis", "nope")).toBeNull()
    })

    it("agrees on codes when the same list is seen concurrently", async () => {
      const ids = await make()
      const rows = [
        { storeId: "a", label: "Mr" },
        { storeId: "b", label: "Ms" },
      ]
      const results = await Promise.all(
        Array.from({ length: 6 }, () => ids.codesFor("csg_salutation", "icis", rows)),
      )
      for (const codes of results) expect(codes).toEqual(["mr", "ms"])
    })
  })
}

registryContract("in memory", async () => new InMemoryIdentityRegistry())

const testDatabaseUrl = process.env.BINDING_TEST_DATABASE_URL
describe.skipIf(!testDatabaseUrl)("Postgres", () => {
  let db: Db
  beforeAll(() => {
    db = createDb(testDatabaseUrl!)
  })
  afterAll(async () => {
    await db?.$client.end()
  })
  registryContract("Postgres", async () => {
    await db.execute(
      sql`truncate option_code_refs, option_codes, anchor_refs, anchors`,
    )
    return new PostgresIdentityRegistry(db)
  })
})

describe("slugify", () => {
  it("turns labels into codes", () => {
    expect(slugify("Prefer not to say")).toBe("prefer-not-to-say")
    expect(slugify("Mx.")).toBe("mx")
    expect(slugify("??")).toBe("option")
  })
})
