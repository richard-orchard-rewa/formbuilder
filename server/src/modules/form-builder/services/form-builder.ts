import type { CreateFormInput, FormsRepository } from "../repositories/forms.js"

export class FormBuilderService {
  constructor(private readonly repo: FormsRepository) {}

  listForms() {
    return this.repo.list()
  }

  createForm(input: CreateFormInput) {
    return this.repo.create(input)
  }
}
