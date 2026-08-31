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

// Thrown when a submissionId passed to edit doesn't resolve to an existing,
// submitted submission for this form (US-5.2) -- it may have never existed,
// belonged to a different form, or still be an in-progress draft (drafts are
// edited via saveDraft, not this).
export class SubmissionNotFoundError extends Error {
  constructor(formId: string, submissionId: string) {
    super(`No submitted submission ${submissionId} found for form ${formId}`)
    this.name = "SubmissionNotFoundError"
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ""
}

function requireFields(fields: Field[], data: Record<string, unknown>) {
  const missingFieldIds = fields
    .filter((field) => field.required && isEmpty(data[field.id]))
    .map((field) => field.id)

  if (missingFieldIds.length > 0) {
    throw new MissingRequiredFieldsError(missingFieldIds)
  }
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
    requireFields(fields, data)

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

  // Corrects a previously submitted submission's values (US-5.2). Validates
  // against the exact schema version the submission was originally captured
  // against -- not the form's current active version, which may since have
  // changed or been republished -- so an edit can never be rejected (or
  // wrongly accepted) against rules that didn't apply when it was captured.
  // Records the prior data as an audit-trail row in the same operation.
  async edit(
    formId: string,
    submissionId: string,
    data: Record<string, unknown>,
    editedBy?: string | null,
  ) {
    const existing = await this.repo.getById(formId, submissionId)
    if (!existing || existing.status !== "submitted") {
      throw new SubmissionNotFoundError(formId, submissionId)
    }

    const fields = (existing.schema as { fields: Field[] }).fields
    requireFields(fields, data)

    const edited = await this.repo.edit(formId, submissionId, data, editedBy)
    if (!edited) {
      throw new SubmissionNotFoundError(formId, submissionId)
    }
    return edited
  }

  // The full edit history for one submission, most recent first (US-5.2).
  getEditHistory(submissionId: string) {
    return this.repo.listEdits(submissionId)
  }
}
