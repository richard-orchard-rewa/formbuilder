export type FormVersionStatus = "draft" | "published" | "superseded"

export interface FormVersionRow {
  id: string
  formId: string
  version: number
  schema: unknown
  status: FormVersionStatus
  createdAt: Date
  publishedAt: Date | null
  publishedBy: string | null
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

// Thrown when a caller references a specific version by id (e.g. as a
// migration's source or target, US-6.1) and it doesn't exist.
export class FormVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`No form version found with id ${versionId}`)
    this.name = "FormVersionNotFoundError"
  }
}

export interface FormVersionsRepository {
  // Publishes the form's current draft version: locks it as immutable,
  // assigns it the next version number, and supersedes whichever version
  // was previously active so only one stays active per form (US-1.2).
  publishDraft(formId: string, publishedBy?: string | null): Promise<FormVersionRow>

  // Applies a schema edit to the form's draft version. If the form has no
  // draft (its active version is published), a new draft is created instead
  // of mutating the published one, so live submissions keep pointing at the
  // exact schema they were captured against (US-1.3).
  editDraft(formId: string, schema: unknown): Promise<FormVersionRow>

  // Lists every version of a form (draft, active, and superseded), most
  // recently created first, so an admin can track changes over time
  // (US-1.4).
  listVersions(formId: string): Promise<FormVersionRow[]>

  // Returns the form's current draft, or null if the form exists but has no
  // draft (its active version is published and untouched since). Throws if
  // the form itself doesn't exist. Lets the builder UI resume editing
  // whatever was last saved (US-2.1).
  getDraft(formId: string): Promise<FormVersionRow | null>

  // Returns the form's currently active (published) version, or null if
  // nothing has been published yet. Throws if the form itself doesn't
  // exist. This is what a submission is validated and recorded against
  // (US-3.5).
  getActiveVersion(formId: string): Promise<FormVersionRow | null>

  // Returns one specific version by id (from any form), or null if it
  // doesn't exist. Used when a caller already knows the exact version it
  // wants -- e.g. migrating a submission onto a specific target version
  // (US-6.1) -- rather than asking for "the draft" or "the active version".
  getVersionById(versionId: string): Promise<FormVersionRow | null>
}
