import type { FormsRepository } from "../repositories/forms.js"

export class FormBuilderService {
  constructor(private readonly repo: FormsRepository) {}

  listForms() {
    return this.repo.list()
  }

  createForm(name: string) {
    return this.repo.create(name)
  }
}
