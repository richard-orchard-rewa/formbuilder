import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { JsonFileConfiguredBindingRepository } from "./registry.js"

describe("JsonFileConfiguredBindingRepository", () => {
  let dir: string | undefined

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("starts empty and persists saved bindings across instances", async () => {
    dir = await mkdtemp(join(tmpdir(), "dbs-"))
    const path = join(dir, "nested", "bindings.json")
    const binding = {
      key: "client.preferredName",
      source: { strategy: "attribute" as const, entity: "contact", attribute: "csg_alias" },
      versions: [],
    }

    expect(await new JsonFileConfiguredBindingRepository(path).list()).toEqual([])
    await new JsonFileConfiguredBindingRepository(path).save(binding)
    await new JsonFileConfiguredBindingRepository(path).save({ ...binding })
    expect(await new JsonFileConfiguredBindingRepository(path).list()).toEqual([binding])
  })
})
