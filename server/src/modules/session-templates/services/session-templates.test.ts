import { describe, expect, it } from "vitest"
import { ModuleVersionsService } from "../../module-builder/services/module-versions.js"
import {
  DuplicateModuleError,
  ModuleNotPublishedError,
  SessionTemplatesService,
} from "./session-templates.js"
import {
  FakeModuleVersionsRepository,
  FakeSessionTemplatesRepository,
  fakeModuleVersion,
} from "./test-fakes.js"

function buildService(moduleVersionsRepo = new FakeModuleVersionsRepository()) {
  const templatesRepo = new FakeSessionTemplatesRepository()
  const service = new SessionTemplatesService(
    templatesRepo,
    new ModuleVersionsService(moduleVersionsRepo),
  )
  return { service, templatesRepo, moduleVersionsRepo }
}

describe("SessionTemplatesService.setComposition (US-8.2)", () => {
  it("persists a valid composition of published modules, in order", async () => {
    const { service, templatesRepo } = buildService(
      new FakeModuleVersionsRepository([
        fakeModuleVersion("mod-a-v1", "mod-a"),
        fakeModuleVersion("mod-b-v1", "mod-b"),
      ]),
    )

    await service.setComposition("template-1", ["mod-a", "mod-b"])

    expect(templatesRepo.setCompositionCalls).toEqual([
      { sessionTemplateId: "template-1", moduleIds: ["mod-a", "mod-b"] },
    ])
  })

  it("rejects a composition that repeats a module id -- one instance per template", async () => {
    const { service, templatesRepo } = buildService(
      new FakeModuleVersionsRepository([fakeModuleVersion("mod-a-v1", "mod-a")]),
    )

    await expect(
      service.setComposition("template-1", ["mod-a", "mod-a"]),
    ).rejects.toThrow(DuplicateModuleError)
    // Nothing was persisted -- validation happens before any write.
    expect(templatesRepo.setCompositionCalls).toHaveLength(0)
  })

  it("rejects a module that has no published version", async () => {
    const { service, templatesRepo } = buildService(new FakeModuleVersionsRepository([]))

    await expect(service.setComposition("template-1", ["mod-a"])).rejects.toThrow(
      ModuleNotPublishedError,
    )
    expect(templatesRepo.setCompositionCalls).toHaveLength(0)
  })

  it("rejects a draft-only module even if it later gets a superseded version", async () => {
    // A module whose only version is superseded (no *currently* published
    // one) must still be rejected -- getActiveVersion only ever returns
    // the current published version, never a superseded one.
    const { service, templatesRepo } = buildService(
      new FakeModuleVersionsRepository([
        fakeModuleVersion("mod-a-v1", "mod-a", { status: "superseded" }),
      ]),
    )

    await expect(service.setComposition("template-1", ["mod-a"])).rejects.toThrow(
      ModuleNotPublishedError,
    )
    expect(templatesRepo.setCompositionCalls).toHaveLength(0)
  })
})

describe("SessionTemplatesService.previewSchema (US-8.3)", () => {
  it("resolves the current composition's modules' current fields, combined in order", async () => {
    const { service, templatesRepo } = buildService(
      new FakeModuleVersionsRepository([
        fakeModuleVersion("mod-a-v1", "mod-a"),
        fakeModuleVersion("mod-b-v1", "mod-b"),
      ]),
    )
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "A", position: 0 },
      { moduleId: "mod-b", name: "B", position: 1 },
    ])

    const { fields } = await service.previewSchema("template-1")

    expect(fields.map((f) => f.id)).toEqual(["mod-a-v1-field", "mod-b-v1-field"])
  })

  it("reflects a module's newly published version without any change to the template itself -- the 'live reference' decision", async () => {
    const moduleVersionsRepo = new FakeModuleVersionsRepository([
      fakeModuleVersion("mod-a-v1", "mod-a"),
    ])
    const { service, templatesRepo } = buildService(moduleVersionsRepo)
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "A", position: 0 },
    ])

    const before = await service.previewSchema("template-1")
    expect(before.fields).toHaveLength(1)

    // Republish mod-a with an extra field -- nothing about the template's
    // own composition changes.
    moduleVersionsRepo.publish(
      fakeModuleVersion("mod-a-v2", "mod-a", {
        version: 2,
        schema: {
          fields: [
            { id: "mod-a-name", type: "text", label: "Name", required: true },
            { id: "mod-a-notes", type: "textarea", label: "Notes", required: false },
          ],
        },
      }),
    )

    const after = await service.previewSchema("template-1")
    expect(after.fields.map((f) => f.id)).toEqual(["mod-a-name", "mod-a-notes"])
  })
})
