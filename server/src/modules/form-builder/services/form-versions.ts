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
}
