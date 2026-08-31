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
  // if a client bypasses its own validation (US-3.5).
  async submit(formId: string, data: Record<string, unknown>) {
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

    return this.repo.create(active.id, data)
  }
}
