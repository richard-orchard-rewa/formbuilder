import type { Field } from "shared"
import type { FormVersionsService } from "../../form-builder/services/form-versions.js"
import type { SubmissionsRepository } from "../repositories/submissions.js"

export class NoActiveVersionError extends Error {
  constructor(formId: string) {
    super(`No active version to submit against for form ${formId}`)
    this.name = "NoActiveVersionError"
  }
}

export class MissingRequiredFieldsError extends Error {
  constructor(public readonly missingFieldIds: string[]) {
    super(`Missing required fields: ${missingFieldIds.join(", ")}`)
    this.name = "MissingRequiredFieldsError"
  }
}

// Thrown when a submissionId passed to finalize doesn't resolve to an
// existing, unfinalized draft for this form (US-4.3) -- it may have never
// existed, belonged to a different form, or already been submitted.
export class DraftNotFoundError extends Error {
  constructor(formId: string, submissionId: string) {
    super(`No draft ${submissionId} found for form ${formId}`)
    this.name = "DraftNotFoundError"
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ""
}

export class SubmissionsService {
  constructor(
    private readonly formVersions: FormVersionsService,
    private readonly repo: SubmissionsRepository,
  ) {}

  // Validates the submission against the form's active version before
  // recording it, so a required field can never be silently skipped even
  // if a client bypasses its own validation (US-3.5). If `submissionId`
  // resumes an existing draft, that row is finalized in place rather than
  // inserting a duplicate (US-4.3).
  async submit(
    formId: string,
    data: Record<string, unknown>,
    submittedBy?: string | null,
    submissionId?: string,
  ) {
    const active = await this.formVersions.getActiveVersion(formId)
    if (!active) {
      throw new NoActiveVersionError(formId)
    }

    const fields = (active.schema as { fields: Field[] }).fields
    const missingFieldIds = fields
      .filter((field) => field.required && isEmpty(data[field.id]))
      .map((field) => field.id)

    if (missingFieldIds.length > 0) {
      throw new MissingRequiredFieldsError(missingFieldIds)
    }

    if (submissionId) {
      const finalized = await this.repo.finalizeDraft(
        formId,
        submissionId,
        active.id,
        data,
        submittedBy,
      )
      if (!finalized) {
        throw new DraftNotFoundError(formId, submissionId)
      }
      return finalized
    }

    return this.repo.create(formId, active.id, data, submittedBy)
  }

  // Saves an in-progress submission with no required-field validation --
  // that's the whole point of a draft (US-4.3). Needs an active version to
  // attach the draft to, same as a direct submission.
  async saveDraft(
    formId: string,
    data: Record<string, unknown>,
    submissionId?: string,
  ) {
    const active = await this.formVersions.getActiveVersion(formId)
    if (!active) {
      throw new NoActiveVersionError(formId)
    }
    return this.repo.saveDraft(formId, active.id, data, submissionId)
  }

  // Fetches a draft to resume filling it out. Returns null if it doesn't
  // exist, belongs to a different form, or has already been finalized
  // (US-4.3).
  getDraft(formId: string, submissionId: string) {
    return this.repo.getDraft(formId, submissionId)
  }

  // A bare-bones list of a form's submissions, just enough to navigate to
  // one (US-5.1).
  listByForm(formId: string) {
    return this.repo.listByForm(formId)
  }

  // Fetches one submission (draft or submitted) together with the exact
  // version it targets, so it renders correctly even if the form has
  // since been republished with a different structure (US-5.1).
  getById(formId: string, submissionId: string) {
    return this.repo.getById(formId, submissionId)
  }
}
