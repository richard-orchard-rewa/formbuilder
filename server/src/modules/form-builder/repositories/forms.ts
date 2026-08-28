export interface FormRow {
  id: string
  name: string
  createdAt: Date
}

export interface FormsRepository {
  list(): Promise<FormRow[]>
  create(name: string): Promise<FormRow>
}
