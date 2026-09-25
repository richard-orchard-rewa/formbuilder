import { sql } from "drizzle-orm"
import type { BindingDescriptor, BindingVersion } from "shared"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDb, type Db } from "./db/client.js"
import {
  BindingSourceConflictError,
  InMemoryConfiguredBindingRepository,
  PostgresConfiguredBindingRepository,
  type ConfiguredBinding,
  type ConfiguredBindingRepository,
} from "./registry.js"

const descriptor = (label: string, version: number): BindingDescriptor => ({
  key: "client.preferredName",
  version,
  label,
  description: "",
  anchor: "client",
  access: "readWrite",
  control: { kind: "text", maxLength: 60 },
  overridable: ["label", "required"],
})

const version = (
  n: number,
  status: BindingVersion["status"],
  label = "Preferred name",
): BindingVersion => ({
  version: n,
  status,
  descriptor: descriptor(label, n),
  createdAt: "2026-09-25T01:00:00.000Z",
  publishedAt: status === "published" ? "2026-09-25T02:00:00.000Z" : null,
})

const binding = (versions: BindingVersion[], attribute = "csg_alias"): ConfiguredBinding => ({
  key: "client.preferredName",
  source: { strategy: "attribute", entity: "contact", attribute },
  versions,
})

// The same rules are required of every repository. The Postgres run needs
// BINDING_TEST_DATABASE_URL (a migrated, disposable database; tables are
// emptied), as for identity.test.ts.
function repositoryContract(name: string, make: () => Promise<ConfiguredBindingRepository>) {
  describe(`${name} configured bindings`, () => {
    it("round-trips a binding and its versions", async () => {
      const repo = await make()
      await repo.save(binding([version(1, "draft")]))
      expect(await repo.list()).toEqual([binding([version(1, "draft")])])
    })

    it("replaces a draft, publishes it, and adds a new draft beside it", async () => {
      const repo = await make()
      await repo.save(binding([version(1, "draft", "Known as")]))
      await repo.save(binding([version(1, "draft")]))
      await repo.save(binding([version(1, "published")]))
      await repo.save(binding([version(1, "published"), version(2, "draft", "Also known as")]))
      const [stored] = await repo.list()
      expect(stored.versions.map((v) => [v.version, v.status, v.descriptor.label])).toEqual([
        [1, "published", "Preferred name"],
        [2, "draft", "Also known as"],
      ])
    })

    it("never changes a published version", async () => {
      const repo = await make()
      await repo.save(binding([version(1, "published")]))
      await repo.save(binding([version(1, "published", "Rewritten")]))
      const [stored] = await repo.list()
      expect(stored.versions[0].descriptor.label).toBe("Preferred name")
    })

    it("refuses to change a binding's attribute", async () => {
      const repo = await make()
      await repo.save(binding([version(1, "draft")]))
      await expect(repo.save(binding([version(1, "draft")], "middlename"))).rejects.toThrow(
        BindingSourceConflictError,
      )
    })

    it("refuses a second binding on the same attribute", async () => {
      const repo = await make()
      await repo.save(binding([version(1, "draft")]))
      await expect(
        repo.save({ ...binding([version(1, "draft")]), key: "client.alias" }),
      ).rejects.toThrow(BindingSourceConflictError)
    })
  })
}

repositoryContract("in-memory", async () => new InMemoryConfiguredBindingRepository())

const testDatabaseUrl = process.env.BINDING_TEST_DATABASE_URL
describe.skipIf(!testDatabaseUrl)("Postgres", () => {
  let db: Db
  beforeAll(() => {
    db = createDb(testDatabaseUrl!)
  })
  afterAll(async () => {
    await db?.$client.end()
  })
  repositoryContract("Postgres", async () => {
    await db.execute(sql`truncate binding_versions, configured_bindings`)
    return new PostgresConfiguredBindingRepository(db)
  })

  it("enforces published immutability in the database itself", async () => {
    await db.execute(sql`truncate binding_versions, configured_bindings`)
    const repo = new PostgresConfiguredBindingRepository(db)
    await repo.save(binding([version(1, "published")]))
    await expect(
      db.execute(sql`update binding_versions set descriptor = '{}'::jsonb`),
    ).rejects.toThrow()
    await expect(db.execute(sql`delete from binding_versions`)).rejects.toThrow()
  })
})
