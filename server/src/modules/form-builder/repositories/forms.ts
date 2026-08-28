export interface FormRow {
  id: string
  name: string
  description: string | null
  slug: string
  createdAt: Date
}

export interface CreateFormInput {
  name: string
  description?: string | null
}

export interface FormsRepository {
  list(): Promise<FormRow[]>
  create(input: CreateFormInput): Promise<FormRow>
}
