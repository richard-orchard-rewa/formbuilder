import type {
  Field,
  SessionTemplateBindingContext,
  SessionTemplateSection,
} from "shared"
import type {
  CreateSessionTemplateSubmissionInput,
  SessionTemplateSubmissionsRepository,
} from "../repositories/session-template-submissions.js"
import { participantData, type SessionBoundFieldsService } from "./session-bound-fields.js"
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

function missing(fields: Field[], data: Record<string, unknown>, prefix = "") {
  return fields
    .filter((field) => field.required && isEmpty(data[field.id]))
    .map((field) => `${prefix}${field.id}`)
}

// Session-wide sections once; participant sections once per participant,
// reported as `participants.<participant anchor id>.<field id>`.
function requireFields(
  sections: SessionTemplateSection[],
  data: Record<string, unknown>,
  participants: string[],
) {
  const missingFieldIds: string[] = []
  for (const section of sections) {
    if (section.scope === "session") {
      missingFieldIds.push(...missing(section.fields, data))
    } else {
      for (const p of participants) {
        missingFieldIds.push(
          ...missing(section.fields, participantData(data, p), `participants.${p}.`),
        )
      }
    }
  }
  if (missingFieldIds.length > 0) {
    throw new MissingRequiredFieldsError(missingFieldIds)
  }
}

export class SessionTemplateSubmissionsService {
  constructor(
    private readonly versions: SessionTemplateVersionsService,
    private readonly repo: SessionTemplateSubmissionsRepository,
    private readonly boundFields?: SessionBoundFieldsService,
  ) {}

  // Validates the submission against the template's active version before
  // recording it (US-8.5), the same defense-in-depth pattern as forms'
  // submit -- required fields are also enforced client-side, but never
  // only there.
  async submit(
    sessionTemplateId: string,
    data: Record<string, unknown>,
    submittedBy?: string | null,
    binding?: SessionTemplateBindingContext,
  ) {
    const active = await this.versions.getActiveVersion(sessionTemplateId)
    if (!active) throw new NoActiveVersionError(sessionTemplateId)

    // Who a participant section is filled for: the session's participants,
    // or -- with no session picked -- whoever the data has values for.
    const participants =
      binding?.participants.map((p) => p.participant) ??
      Object.keys(
        data.participants && typeof data.participants === "object" ? data.participants : {},
      )
    requireFields(active.sections, data, participants)

    const input: CreateSessionTemplateSubmissionInput = {
      sessionTemplateId,
      sessionTemplateVersionId: active.id,
      data,
      submittedBy,
    }
    const row = await this.repo.create(input)
    const bindingResults = await this.boundFields?.commit(
      row.id,
      active.sections,
      data,
      binding,
    )
    return { ...row, ...(bindingResults ? { bindingResults } : {}) }
  }

  list(sessionTemplateId: string) {
    return this.repo.list(sessionTemplateId)
  }

  // One submission plus the exact schema (and version number) it was
  // captured against, so it always renders correctly even if the template
  // has since been republished with a different composition -- mirrors
  // SubmissionsService's own getDetail for forms (US-5.1).
  async getDetail(sessionTemplateId: string, submissionId: string) {
    const row = await this.repo.getById(sessionTemplateId, submissionId)
    if (!row) return null

    const version = await this.versions.getVersionById(row.sessionTemplateVersionId)
    // Shouldn't happen -- a session template version is never deleted --
    // but a submission with no resolvable version can't be rendered.
    if (!version) return null

    const bindingResults = await this.boundFields?.resultsFor(row.id)
    return {
      ...row,
      sessionTemplateVersionNumber: version.version,
      schema: { fields: version.fields, sections: version.sections },
      ...(bindingResults ? { bindingResults } : {}),
    }
  }
}
