import type { Field, FieldMapping, FormSchema } from "shared"
import { FormVersionNotFoundError } from "../../form-builder/repositories/form-versions.js"
import type { FormVersionsService } from "../../form-builder/services/form-versions.js"
import type {
  SubmissionListFilters,
  SubmissionsRepository,
} from "../repositories/submissions.js"
import { migrateData } from "./migration.js"

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

  // A form's submissions for review/reporting, optionally narrowed by date
  // range or schema version (US-5.1, US-5.3).
  listByForm(formId: string, filters?: SubmissionListFilters) {
    return this.repo.listByForm(formId, filters)
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
  // The prior row state is archived as an audit-trail row by a database
  // trigger as part of the same UPDATE (US-6.1).
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

  // Every version of one submission across its lifetime, oldest first,
  // including the current one (US-5.2, US-6.1, US-6.2).
  getVersions(submissionId: string) {
    return this.repo.listVersions(submissionId)
  }

  // The version of a submission that was active at a specific point in
  // time (US-6.2) -- "what did this look like on date X" -- or null if
  // `asOf` predates the submission's own creation. `activeTo: null` (the
  // current version) is treated as an open-ended window extending to now.
  async getVersionAt(submissionId: string, asOf: Date) {
    const versions = await this.repo.listVersions(submissionId)
    return (
      versions.find(
        (version) =>
          version.activeFrom <= asOf &&
          (version.activeTo === null || asOf < version.activeTo),
      ) ?? null
    )
  }

  // Computes the diff an admin needs to decide a migration plan for
  // (US-6.1): which of `fromVersionId`'s fields carry over to
  // `targetVersionId` under the same id, and which need an explicit
  // FieldMapping because they don't.
  async getMigrationPlan(fromVersionId: string, targetVersionId: string) {
    const [fromVersion, targetVersion] = await Promise.all([
      this.formVersions.getVersionById(fromVersionId),
      this.formVersions.getVersionById(targetVersionId),
    ])
    if (!fromVersion) throw new FormVersionNotFoundError(fromVersionId)
    if (!targetVersion) throw new FormVersionNotFoundError(targetVersionId)

    const sourceFields = (fromVersion.schema as FormSchema).fields
    const targetFields = (targetVersion.schema as FormSchema).fields
    const targetIds = new Set(targetFields.map((field) => field.id))

    const autoMappedFields = sourceFields
      .filter((field) => targetIds.has(field.id))
      .map(({ id, label, type }) => ({ id, label, type }))
    const unmappedSourceFields = sourceFields
      .filter((field) => !targetIds.has(field.id))
      .map(({ id, label, type }) => ({ id, label, type }))

    return {
      autoMappedFields,
      unmappedSourceFields,
      targetFields: targetFields.map(({ id, label, type }) => ({
        id,
        label,
        type,
      })),
    }
  }

  // Migrates one submitted submission onto `targetVersionId` (US-6.1),
  // applying `fieldMappings` for whatever fields don't carry over
  // automatically. The source row is left untouched -- this always creates
  // a new submission, linked back via `migratedFromSubmissionId` -- and
  // re-running it for the same (submission, target version) pair returns
  // the existing copy rather than creating a duplicate. The new row is
  // saved as a draft rather than submitted if the mapping leaves one of the
  // target version's required fields empty, so it surfaces in the
  // submissions list as needing follow-up rather than silently passing
  // validation it wouldn't otherwise have passed.
  async migrateSubmission(
    formId: string,
    submissionId: string,
    targetVersionId: string,
    fieldMappings: FieldMapping[],
    migratedBy?: string | null,
  ) {
    const existing = await this.repo.getById(formId, submissionId)
    if (!existing || existing.status !== "submitted") {
      throw new SubmissionNotFoundError(formId, submissionId)
    }

    const alreadyMigrated = await this.repo.findMigratedCopy(
      submissionId,
      targetVersionId,
    )
    if (alreadyMigrated) return alreadyMigrated

    const targetVersion = await this.formVersions.getVersionById(targetVersionId)
    if (!targetVersion) throw new FormVersionNotFoundError(targetVersionId)

    const sourceFields = (existing.schema as FormSchema).fields
    const targetFields = (targetVersion.schema as FormSchema).fields
    const { data, legacyData } = migrateData(
      sourceFields,
      targetFields,
      fieldMappings,
      existing.data as Record<string, unknown>,
    )

    const missingRequired = targetFields.filter(
      (field) => field.required && isEmpty(data[field.id]),
    )

    return this.repo.createMigrated({
      formId,
      formVersionId: targetVersionId,
      data,
      legacyData,
      status: missingRequired.length > 0 ? "draft" : "submitted",
      migratedFromSubmissionId: submissionId,
      migratedBy,
    })
  }

  // Migrates every submitted submission captured against `fromVersionId`
  // onto `targetVersionId` using the same field-mapping plan (US-6.1).
  // Submissions already migrated to that target are skipped rather than
  // re-migrated, so this can be safely re-run (e.g. after new submissions
  // arrive against the old version).
  async migrateVersion(
    formId: string,
    fromVersionId: string,
    targetVersionId: string,
    fieldMappings: FieldMapping[],
    migratedBy?: string | null,
  ) {
    const targetVersion = await this.formVersions.getVersionById(targetVersionId)
    if (!targetVersion) throw new FormVersionNotFoundError(targetVersionId)

    const sourceSubmissions = await this.repo.listSubmittedByVersion(
      formId,
      fromVersionId,
    )

    let migratedCount = 0
    let needsFollowUpCount = 0
    let alreadyMigratedCount = 0

    for (const submission of sourceSubmissions) {
      const existingCopy = await this.repo.findMigratedCopy(
        submission.id,
        targetVersionId,
      )
      if (existingCopy) {
        alreadyMigratedCount++
        continue
      }

      const migrated = await this.migrateSubmission(
        formId,
        submission.id,
        targetVersionId,
        fieldMappings,
        migratedBy,
      )
      migratedCount++
      if (migrated.status === "draft") needsFollowUpCount++
    }

    return { migratedCount, needsFollowUpCount, alreadyMigratedCount }
  }
}
