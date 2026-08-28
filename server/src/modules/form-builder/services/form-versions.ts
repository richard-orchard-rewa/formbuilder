import type { FormVersionsRepository } from "../repositories/form-versions.js"

export class FormVersionsService {
  constructor(private readonly repo: FormVersionsRepository) {}

  publishDraft(formId: string) {
    return this.repo.publishDraft(formId)
  }
}
