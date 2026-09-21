// In-memory fakes for the repository interfaces the session-templates
// services depend on, so their business rules (composition validation,
// publish snapshotting, required-field enforcement) can be unit tested
// without a live Postgres. Not itself a test file -- vitest only picks up
// `*.test.ts`.
import type {
  CreateModuleInput,
  ModuleListRow,
  ModuleRow,
  ModulesRepository,
} from "../../module-builder/repositories/modules.js"
import type {
  ModuleVersionRow,
  ModuleVersionsRepository,
} from "../../module-builder/repositories/module-versions.js"
import type {
  CreateSessionTemplateInput,
  SessionTemplateModuleRow,
  SessionTemplateRow,
  SessionTemplatesRepository,
} from "../repositories/session-templates.js"
import type {
  SessionTemplateModuleSnapshotInput,
  SessionTemplateVersionRow,
  SessionTemplateVersionsRepository,
} from "../repositories/session-template-versions.js"
import type {
  CreateSessionTemplateSubmissionInput,
  SessionTemplateSubmissionRow,
  SessionTemplateSubmissionsRepository,
} from "../repositories/session-template-submissions.js"

function notImplemented(): never {
  throw new Error("not implemented in fake")
}

export class FakeModulesRepository implements ModulesRepository {
  constructor(private readonly modules: ModuleRow[] = []) {}

  async list(): Promise<ModuleListRow[]> {
    return this.modules.map((m) => ({ ...m, hasPublishedVersion: true }))
  }
  create(_input: CreateModuleInput): Promise<ModuleRow> {
    return notImplemented()
  }
  archive(_moduleId: string): Promise<ModuleRow> {
    return notImplemented()
  }
  async getById(moduleId: string): Promise<ModuleRow | null> {
    return this.modules.find((m) => m.id === moduleId) ?? null
  }
}

export function fakeModule(id: string, name = id): ModuleRow {
  return { id, name, description: null, archivedAt: null, createdAt: new Date() }
}

export class FakeModuleVersionsRepository implements ModuleVersionsRepository {
  constructor(private versions: ModuleVersionRow[] = []) {}

  publishDraft(): Promise<ModuleVersionRow> {
    return notImplemented()
  }
  editDraft(): Promise<ModuleVersionRow> {
    return notImplemented()
  }
  getDraft(): Promise<ModuleVersionRow | null> {
    return notImplemented()
  }
  async getActiveVersion(moduleId: string): Promise<ModuleVersionRow | null> {
    return (
      this.versions.find((v) => v.moduleId === moduleId && v.status === "published") ??
      null
    )
  }
  async getVersionById(versionId: string): Promise<ModuleVersionRow | null> {
    return this.versions.find((v) => v.id === versionId) ?? null
  }

  // Simulates republishing a module (US-7.3): the previous published
  // version for that module stays in place (still fetchable by id, as
  // "superseded"), and the new one becomes current.
  publish(version: ModuleVersionRow) {
    for (const v of this.versions) {
      if (v.moduleId === version.moduleId && v.status === "published") {
        v.status = "superseded"
      }
    }
    this.versions.push(version)
  }
}

export function fakeModuleVersion(
  id: string,
  moduleId: string,
  overrides: Partial<ModuleVersionRow> = {},
): ModuleVersionRow {
  return {
    id,
    moduleId,
    version: 1,
    schema: {
      fields: [{ id: `${id}-field`, type: "text", label: "Name", required: true }],
    },
    status: "published",
    createdAt: new Date(),
    publishedAt: new Date(),
    publishedBy: null,
    ...overrides,
  }
}

export class FakeSessionTemplatesRepository implements SessionTemplatesRepository {
  public compositions = new Map<string, SessionTemplateModuleRow[]>()
  public setCompositionCalls: Array<{ sessionTemplateId: string; moduleIds: string[] }> =
    []

  constructor(private readonly templates: SessionTemplateRow[] = []) {}

  async list(): Promise<SessionTemplateRow[]> {
    return this.templates
  }
  create(_input: CreateSessionTemplateInput): Promise<SessionTemplateRow> {
    return notImplemented()
  }
  archive(_sessionTemplateId: string): Promise<SessionTemplateRow> {
    return notImplemented()
  }
  async getComposition(sessionTemplateId: string): Promise<SessionTemplateModuleRow[]> {
    return this.compositions.get(sessionTemplateId) ?? []
  }
  async setComposition(
    sessionTemplateId: string,
    moduleIds: string[],
  ): Promise<SessionTemplateModuleRow[]> {
    this.setCompositionCalls.push({ sessionTemplateId, moduleIds })
    const rows = moduleIds.map((moduleId, position) => ({
      moduleId,
      name: `module-${moduleId}`,
      position,
    }))
    this.compositions.set(sessionTemplateId, rows)
    return rows
  }
}

export class FakeSessionTemplateVersionsRepository
  implements SessionTemplateVersionsRepository
{
  public rows: SessionTemplateVersionRow[] = []
  private nextId = 1

  async publish(
    sessionTemplateId: string,
    modules: SessionTemplateModuleSnapshotInput[],
    publishedBy?: string | null,
  ): Promise<SessionTemplateVersionRow> {
    const existing = this.rows.filter((r) => r.sessionTemplateId === sessionTemplateId)
    const nextVersion = Math.max(0, ...existing.map((r) => r.version)) + 1
    for (const row of existing) {
      if (row.status === "published") row.status = "superseded"
    }
    const row: SessionTemplateVersionRow = {
      id: `stv-${this.nextId++}`,
      sessionTemplateId,
      version: nextVersion,
      modules,
      status: "published",
      createdAt: new Date(),
      publishedAt: new Date(),
      publishedBy: publishedBy ?? null,
    }
    this.rows.push(row)
    return row
  }

  async getActiveVersion(
    sessionTemplateId: string,
  ): Promise<SessionTemplateVersionRow | null> {
    return (
      this.rows.find(
        (r) => r.sessionTemplateId === sessionTemplateId && r.status === "published",
      ) ?? null
    )
  }

  async listVersions(sessionTemplateId: string): Promise<SessionTemplateVersionRow[]> {
    return this.rows.filter((r) => r.sessionTemplateId === sessionTemplateId)
  }

  async getVersionById(versionId: string): Promise<SessionTemplateVersionRow | null> {
    return this.rows.find((r) => r.id === versionId) ?? null
  }
}

export class FakeSessionTemplateSubmissionsRepository
  implements SessionTemplateSubmissionsRepository
{
  public created: CreateSessionTemplateSubmissionInput[] = []

  async create(
    input: CreateSessionTemplateSubmissionInput,
  ): Promise<SessionTemplateSubmissionRow> {
    this.created.push(input)
    return {
      id: `sub-${this.created.length}`,
      sessionTemplateId: input.sessionTemplateId,
      sessionTemplateVersionId: input.sessionTemplateVersionId,
      data: input.data,
      submittedBy: input.submittedBy ?? null,
      submittedAt: new Date(),
    }
  }

  async list(sessionTemplateId: string) {
    return this.created
      .filter((c) => c.sessionTemplateId === sessionTemplateId)
      .map((c, index) => ({
        id: `sub-${index + 1}`,
        sessionTemplateVersionNumber: 1,
        submittedBy: c.submittedBy ?? null,
        submittedAt: new Date(),
      }))
  }

  async getById(sessionTemplateId: string, submissionId: string) {
    const index = Number(submissionId.replace("sub-", "")) - 1
    const created = this.created[index]
    if (!created || created.sessionTemplateId !== sessionTemplateId) return null
    return {
      id: submissionId,
      sessionTemplateId: created.sessionTemplateId,
      sessionTemplateVersionId: created.sessionTemplateVersionId,
      data: created.data,
      submittedBy: created.submittedBy ?? null,
      submittedAt: new Date(),
    }
  }
}
