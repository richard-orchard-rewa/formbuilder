import { describe, expect, it } from "vitest"
import { ModuleBuilderService } from "../../module-builder/services/module-builder.js"
import { ModuleVersionsService } from "../../module-builder/services/module-versions.js"
import {
  MissingRequiredFieldsError,
  NoActiveVersionError,
  SessionTemplateSubmissionsService,
} from "./session-template-submissions.js"
import { SessionTemplateVersionsService } from "./session-template-versions.js"
import { SessionTemplatesService } from "./session-templates.js"
import {
  FakeModuleVersionsRepository,
  FakeModulesRepository,
  FakeSessionTemplateSubmissionsRepository,
  FakeSessionTemplateVersionsRepository,
  FakeSessionTemplatesRepository,
  fakeModule,
  fakeModuleVersion,
} from "./test-fakes.js"

function buildServices() {
  const modulesRepo = new FakeModulesRepository([fakeModule("mod-a", "Module A")])
  const moduleVersionsRepo = new FakeModuleVersionsRepository([
    fakeModuleVersion("mod-a-v1", "mod-a", {
      schema: {
        fields: [
          { id: "name", type: "text", label: "Full name", required: true },
          { id: "notes", type: "textarea", label: "Notes", required: false },
        ],
      },
    }),
  ])
  const templatesRepo = new FakeSessionTemplatesRepository()
  const versionsRepo = new FakeSessionTemplateVersionsRepository()
  const submissionsRepo = new FakeSessionTemplateSubmissionsRepository()

  const moduleVersions = new ModuleVersionsService(moduleVersionsRepo)
  const sessionTemplates = new SessionTemplatesService(templatesRepo, moduleVersions)
  const versions = new SessionTemplateVersionsService(
    versionsRepo,
    sessionTemplates,
    new ModuleBuilderService(modulesRepo),
    moduleVersions,
  )
  const submissions = new SessionTemplateSubmissionsService(versions, submissionsRepo)

  return { templatesRepo, versions, submissions, submissionsRepo }
}

describe("SessionTemplateSubmissionsService.submit (US-8.5)", () => {
  it("refuses to submit against a template that's never been published", async () => {
    const { submissions } = buildServices()
    await expect(
      submissions.submit("template-1", { name: "Ada Lovelace" }),
    ).rejects.toThrow(NoActiveVersionError)
  })

  it("rejects a submission missing a required field, naming exactly which one -- defense in depth behind client-side validation", async () => {
    const { templatesRepo, versions, submissions, submissionsRepo } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "Module A", position: 0 },
    ])
    await versions.publish("template-1")

    await expect(
      submissions.submit("template-1", { notes: "hi" }),
    ).rejects.toMatchObject({
      constructor: MissingRequiredFieldsError,
      missingFieldIds: ["name"],
    })
    expect(submissionsRepo.created).toHaveLength(0)
  })

  it("treats an empty string as missing, but accepts an empty optional field", async () => {
    const { templatesRepo, versions, submissions, submissionsRepo } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "Module A", position: 0 },
    ])
    await versions.publish("template-1")

    await expect(
      submissions.submit("template-1", { name: "", notes: "" }),
    ).rejects.toThrow(MissingRequiredFieldsError)

    const submission = await submissions.submit("template-1", {
      name: "Ada Lovelace",
      notes: "",
    })
    expect(submission.data).toEqual({ name: "Ada Lovelace", notes: "" })
    expect(submissionsRepo.created).toHaveLength(1)
  })

  it("stores a valid submission tied to the exact active session template version", async () => {
    const { templatesRepo, versions, submissions, submissionsRepo } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "Module A", position: 0 },
    ])
    const active = await versions.publish("template-1")

    const submission = await submissions.submit(
      "template-1",
      { name: "Ada Lovelace", notes: "Looking forward to this" },
      "front-desk",
    )

    expect(submission.sessionTemplateVersionId).toBe(active.id)
    expect(submission.submittedBy).toBe("front-desk")
    expect(submissionsRepo.created).toEqual([
      {
        sessionTemplateId: "template-1",
        sessionTemplateVersionId: active.id,
        data: { name: "Ada Lovelace", notes: "Looking forward to this" },
        submittedBy: "front-desk",
      },
    ])
  })
})

describe("SessionTemplateSubmissionsService.list / getDetail", () => {
  it("lists only submissions captured against the given template", async () => {
    const { templatesRepo, versions, submissions } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "Module A", position: 0 },
    ])
    await versions.publish("template-1")
    await submissions.submit("template-1", { name: "Ada Lovelace" })
    await submissions.submit("template-1", { name: "Grace Hopper" })

    const list = await submissions.list("template-1")

    expect(list).toHaveLength(2)
    expect(list.every((s) => s.sessionTemplateVersionNumber === 1)).toBe(true)
  })

  it("resolves a submission's detail with the exact schema/version it was captured against", async () => {
    const { templatesRepo, versions, submissions } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "Module A", position: 0 },
    ])
    await versions.publish("template-1")
    const created = await submissions.submit("template-1", {
      name: "Ada Lovelace",
    })

    const detail = await submissions.getDetail("template-1", created.id)

    expect(detail?.sessionTemplateVersionNumber).toBe(1)
    expect(detail?.schema.fields.map((f) => f.id)).toEqual(["name", "notes"])
    expect(detail?.data).toEqual({ name: "Ada Lovelace" })
  })

  it("returns null for a submission id that belongs to a different template", async () => {
    const { templatesRepo, versions, submissions } = buildServices()
    templatesRepo.compositions.set("template-1", [
      { moduleId: "mod-a", name: "Module A", position: 0 },
    ])
    await versions.publish("template-1")
    const created = await submissions.submit("template-1", {
      name: "Ada Lovelace",
    })

    expect(await submissions.getDetail("template-2", created.id)).toBeNull()
  })
})
