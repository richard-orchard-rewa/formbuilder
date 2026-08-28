import type { FormVersionsRepository } from "../repositories/form-versions.js"

export class FormVersionsService {
  constructor(private readonly repo: FormVersionsRepository) {}

  publishDraft(formId: string) {
    return this.repo.publishDraft(formId)
  }

  editDraft(formId: string, schema: unknown) {
    return this.repo.editDraft(formId, schema)
  }
}
