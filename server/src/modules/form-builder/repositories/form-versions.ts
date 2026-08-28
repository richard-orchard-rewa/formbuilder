export type FormVersionStatus = "draft" | "published" | "superseded"

export interface FormVersionRow {
  id: string
  formId: string
  version: number
  schema: unknown
  status: FormVersionStatus
  createdAt: Date
  publishedAt: Date | null
}

// Thrown when a form has no draft version to publish, either because the
// form doesn't exist or its only draft was already published.
export class NoDraftVersionError extends Error {
  constructor(formId: string) {
    super(`No draft version found for form ${formId}`)
    this.name = "NoDraftVersionError"
  }
}

export class FormNotFoundError extends Error {
  constructor(formId: string) {
    super(`No form found with id ${formId}`)
    this.name = "FormNotFoundError"
  }
}

export interface FormVersionsRepository {
  // Publishes the form's current draft version: locks it as immutable,
  // assigns it the next version number, and supersedes whichever version
  // was previously active so only one stays active per form (US-1.2).
  publishDraft(formId: string): Promise<FormVersionRow>

  // Applies a schema edit to the form's draft version. If the form has no
  // draft (its active version is published), a new draft is created instead
  // of mutating the published one, so live submissions keep pointing at the
  // exact schema they were captured against (US-1.3).
  editDraft(formId: string, schema: unknown): Promise<FormVersionRow>
}
