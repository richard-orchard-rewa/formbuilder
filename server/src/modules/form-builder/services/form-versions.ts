import type { FormSchema } from "shared"
import type { FormVersionsRepository } from "../repositories/form-versions.js"

export class FormVersionsService {
  constructor(private readonly repo: FormVersionsRepository) {}

  publishDraft(formId: string, publishedBy?: string | null) {
    return this.repo.publishDraft(formId, publishedBy)
  }

  listVersions(formId: string) {
    return this.repo.listVersions(formId)
  }

  editDraft(formId: string, schema: unknown) {
    return this.repo.editDraft(formId, schema)
  }

  getDraft(formId: string) {
    return this.repo.getDraft(formId)
  }

  getActiveVersion(formId: string) {
    return this.repo.getActiveVersion(formId)
  }

  // The field ids that appear in any version other than the current draft
  // (US-2.4): deleting one of these from the draft has downstream impact on
  // submissions already collected against a published version.
  async listPublishedFieldIds(formId: string): Promise<string[]> {
    const versions = await this.repo.listVersions(formId)
    const ids = new Set<string>()
    for (const version of versions) {
      if (version.status === "draft") continue
      // The jsonb column is untyped at the DB layer; the app is the only
      // writer and always writes the FormSchema shape.
      const schema = version.schema as FormSchema
      for (const field of schema.fields) ids.add(field.id)
    }
    return [...ids]
  }
}
