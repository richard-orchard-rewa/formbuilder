import { describe, expect, it } from "vitest"
import { ModuleBuilderService } from "../../module-builder/services/module-builder.js"
import { ModuleVersionsService } from "../../module-builder/services/module-versions.js"
import {
  EmptyCompositionError,
  SessionTemplateVersionsService,
} from "./session-template-versions.js"
import { SessionTemplatesService } from "./session-templates.js"
import {
  FakeModuleVersionsRepository,
  FakeModulesRepository,
  FakeSessionTemplateVersionsRepository,
  FakeSessionTemplatesRepository,
  fakeModule,
  fakeModuleVersion,
} from "./test-fakes.js"

function buildServices() {
  const modulesRepo = new FakeModulesRepository([
    fakeModule("mod-a", "Module A"),
    fakeModule("mod-b", "Module B"),
  ])
  const moduleVersionsRepo = new FakeModuleVersionsRepository([
    fakeModuleVersion("mod-a-v1", "mod-a"),
    fakeModuleVersion("mod-b-v1", "mod-b"),
  ])
  const templatesRepo = new FakeSessionTemplatesRepository()
  const versionsRepo = new FakeSessionTemplateVersionsRepository()

  const modules = new ModuleBuilderService(modulesRepo)
  const moduleVersions = new ModuleVersionsService(moduleVersionsRepo)
  const sessionTemplates = new SessionTemplatesService(templatesRepo, moduleVersions)
  const versions = new SessionTemplateVersionsService(
    versionsRepo,
    sessionTemplates,
    modules,
    moduleVersions,
  )

  return { versions, templatesRepo, moduleVersionsRepo, versionsRepo }
}

describe("SessionTemplateVersionsService.publish (US-8.4)", () => {
  it("refuses to publish an empty composition", async () => {
    const { versions } = buildServices()
    await expect(versions.publish("template-1")).rejects.toThrow(EmptyCompositionError)
  })

  it("snapshots each module's current published version, resolved with names and version numbers, in composition order", async () => {
    const { versions, templatesRepo } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-b", name: "Module B", position: 0 },
      { moduleId: "mod-a", name: "Module A", position: 1 },
    ])

    const published = await versions.publish("template-1")

    expect(published.version).toBe(1)
    expect(published.status).toBe("published")
    expect(published.modules).toEqual([
      {
        moduleId: "mod-b",
        moduleName: "Module B",
        moduleVersionId: "mod-b-v1",
        moduleVersionNumber: 1,
      },
      {
        moduleId: "mod-a",
        moduleName: "Module A",
        moduleVersionId: "mod-a-v1",
        moduleVersionNumber: 1,
      },
    ])
    expect(published.fields.map((f) => f.id)).toEqual(["mod-b-v1-field", "mod-a-v1-field"])
  })

  it("supersedes the previous version when publishing again, incrementing the version number", async () => {
    const { versions, templatesRepo } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "Module A", position: 0 },
    ])

    const first = await versions.publish("template-1")
    expect(first.version).toBe(1)

    const second = await versions.publish("template-1")
    expect(second.version).toBe(2)

    const active = await versions.getActiveVersion("template-1")
    expect(active?.id).toBe(second.id)

    const history = await versions.listVersions("template-1")
    expect(history.find((v) => v.id === first.id)?.status).toBe("superseded")
  })

  it("keeps a published version's snapshot fixed even after the module it referenced is republished -- the immutability guarantee ADR-0004 already gives forms", async () => {
    const { versions, templatesRepo, moduleVersionsRepo } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "Module A", position: 0 },
    ])

    const publishedVersion = await versions.publish("template-1")
    expect(publishedVersion.fields.map((f) => f.id)).toEqual(["mod-a-v1-field"])

    // mod-a gets a new published version with a different field, *after*
    // the session template version above was published.
    moduleVersionsRepo.publish(
      fakeModuleVersion("mod-a-v2", "mod-a", {
        version: 2,
        schema: {
          fields: [{ id: "mod-a-v2-field", type: "text", label: "New", required: false }],
        },
      }),
    )

    // The already-published version must still resolve to what it
    // snapshotted, not the module's new current version.
    const past = await versions.getVersionById(publishedVersion.id)
    expect(past?.fields.map((f) => f.id)).toEqual(["mod-a-v1-field"])

    const active = await versions.getActiveVersion("template-1")
    expect(active?.fields.map((f) => f.id)).toEqual(["mod-a-v1-field"])
  })

  it("returns null for a template with no published version yet", async () => {
    const { versions } = buildServices()
    expect(await versions.getActiveVersion("template-1")).toBeNull()
  })
})
