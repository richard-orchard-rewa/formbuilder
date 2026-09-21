import type { Field } from "shared"
import type {
  CreateSessionTemplateSubmissionInput,
  SessionTemplateSubmissionsRepository,
} from "../repositories/session-template-submissions.js"
import type { SessionTemplateVersionsService } from "./session-template-versions.js"

export class NoActiveVersionError extends Error {
  constructor(sessionTemplateId: string) {
    super(
      `No active version to submit against for session template ${sessionTemplateId}`,
    )
    this.name = "NoActiveVersionError"
  }
}

export class MissingRequiredFieldsError extends Error {
  constructor(public readonly missingFieldIds: string[]) {
    super(`Missing required fields: ${missingFieldIds.join(", ")}`)
    this.name = "MissingRequiredFieldsError"
  }
}

// Mirrors submissions/services/submissions.ts's own isEmpty/requireFields
// exactly -- duplicated rather than shared since session templates and
// forms are intentionally independent features.
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

export class SessionTemplateSubmissionsService {
  constructor(
    private readonly versions: SessionTemplateVersionsService,
    private readonly repo: SessionTemplateSubmissionsRepository,
  ) {}

  // Validates the submission against the template's active version before
  // recording it (US-8.5), the same defense-in-depth pattern as forms'
  // submit -- required fields are also enforced client-side, but never
  // only there.
  async submit(
    sessionTemplateId: string,
    data: Record<string, unknown>,
    submittedBy?: string | null,
  ) {
    const active = await this.versions.getActiveVersion(sessionTemplateId)
    if (!active) throw new NoActiveVersionError(sessionTemplateId)

    requireFields(active.fields, data)

    const input: CreateSessionTemplateSubmissionInput = {
      sessionTemplateId,
      sessionTemplateVersionId: active.id,
      data,
      submittedBy,
    }
    return this.repo.create(input)
  }
}
