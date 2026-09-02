import type {
  Field,
  FieldMapping,
  FormSchema,
  FormSummary,
  FormVersion,
  FormVersionSummary,
  MigrationPlan,
  MigrationResult,
  Submission,
  SubmissionDetail,
  SubmissionHistory,
  SubmissionListQuery,
  SubmissionSummary,
  SubmissionValidationError,
} from "shared"

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function listForms(): Promise<FormSummary[]> {
  return fetch("/api/forms").then((res) => json<FormSummary[]>(res))
}

export function createForm(name: string): Promise<FormSummary> {
  return fetch("/api/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((res) => json<FormSummary>(res))
}

export function getDraft(formId: string): Promise<FormVersion | null> {
  return fetch(`/api/forms/${formId}/draft`).then((res) =>
    json<FormVersion | null>(res),
  )
}

export function saveDraft(
  formId: string,
  fields: Field[],
): Promise<FormVersion> {
  const body: FormSchema = { fields }
  return fetch(`/api/forms/${formId}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => json<FormVersion>(res))
}

export function getActiveVersion(formId: string): Promise<FormVersion | null> {
  return fetch(`/api/forms/${formId}/active`).then((res) =>
    json<FormVersion | null>(res),
  )
}

// Thrown when a form has no draft to publish (e.g. it was already published
// with no further edits since).
export class NoDraftToPublishError extends Error {
  constructor() {
    super("This form has no draft changes to publish")
    this.name = "NoDraftToPublishError"
  }
}

export async function publishForm(formId: string): Promise<FormVersion> {
  const res = await fetch(`/api/forms/${formId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (res.status === 409) {
    throw new NoDraftToPublishError()
  }
  return json<FormVersion>(res)
}

// Thrown when the server rejects a submission for missing required fields
// (US-3.5) — a defense-in-depth check behind the form's own client-side
// `required` validation.
export class SubmissionRejectedError extends Error {
  constructor(public readonly missingFieldIds: string[]) {
    super("Some required fields are missing")
    this.name = "SubmissionRejectedError"
  }
}

export async function submitForm(
  formId: string,
  data: Record<string, unknown>,
  submissionId?: string,
): Promise<Submission> {
  const res = await fetch(`/api/forms/${formId}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, submissionId }),
  })
  if (res.status === 400) {
    const body = (await res.json()) as SubmissionValidationError
    throw new SubmissionRejectedError(body.missingFieldIds)
  }
  return json<Submission>(res)
}

// Saves an in-progress submission with no required-field validation, so a
// respondent can return and finish it later (US-4.3). With no
// `submissionId`, creates a new draft; with one, overwrites that draft's
// data in place.
export function saveDraftSubmission(
  formId: string,
  data: Record<string, unknown>,
  submissionId?: string,
): Promise<Submission> {
  return fetch(`/api/forms/${formId}/submissions/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, submissionId }),
  }).then((res) => json<Submission>(res))
}

// Fetches a saved draft to resume filling it out. Resolves to null if it
// no longer exists, belongs to a different form, or has already been
// finalized (US-4.3).
export function getDraftSubmission(
  formId: string,
  submissionId: string,
): Promise<Submission | null> {
  return fetch(`/api/forms/${formId}/submissions/draft/${submissionId}`).then(
    (res) => json<Submission | null>(res),
  )
}

export function getPublishedFieldIds(formId: string): Promise<string[]> {
  return fetch(`/api/forms/${formId}/published-field-ids`).then((res) =>
    json<string[]>(res),
  )
}

// A form's submissions for review/reporting, optionally narrowed by date
// range or schema version (US-5.1, US-5.3).
export function listSubmissions(
  formId: string,
  filters?: SubmissionListQuery,
): Promise<SubmissionSummary[]> {
  const query = new URLSearchParams()
  if (filters?.from) query.set("from", filters.from)
  if (filters?.to) query.set("to", filters.to)
  if (filters?.formVersionNumber !== undefined) {
    query.set("formVersionNumber", String(filters.formVersionNumber))
  }
  const queryString = query.toString()
  return fetch(
    `/api/forms/${formId}/submissions${queryString ? `?${queryString}` : ""}`,
  ).then((res) => json<SubmissionSummary[]>(res))
}

// The version history of a form, so a submission list can offer "filter by
// version" (US-5.3).
export function listFormVersions(
  formId: string,
): Promise<FormVersionSummary[]> {
  return fetch(`/api/forms/${formId}/versions`).then((res) =>
    json<FormVersionSummary[]>(res),
  )
}

// Fetches one submission together with the exact schema version it was
// captured against, so it renders correctly even if the form has since
// been republished with a different structure (US-5.1).
export function getSubmission(
  formId: string,
  submissionId: string,
): Promise<SubmissionDetail> {
  return fetch(`/api/forms/${formId}/submissions/${submissionId}`).then(
    (res) => json<SubmissionDetail>(res),
  )
}

// Corrects a previously submitted submission's values, validated against
// the exact schema version it was originally captured against rather than
// the form's current active version (US-5.2).
export async function editSubmission(
  formId: string,
  submissionId: string,
  data: Record<string, unknown>,
  editedBy?: string,
): Promise<Submission> {
  const res = await fetch(`/api/forms/${formId}/submissions/${submissionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, editedBy }),
  })
  if (res.status === 400) {
    const body = (await res.json()) as SubmissionValidationError
    throw new SubmissionRejectedError(body.missingFieldIds)
  }
  return json<Submission>(res)
}

// The audit-trail history for one submission, most recently superseded
// first (US-5.2, US-6.1).
export function getSubmissionHistory(
  formId: string,
  submissionId: string,
): Promise<SubmissionHistory[]> {
  return fetch(`/api/forms/${formId}/submissions/${submissionId}/history`).then(
    (res) => json<SubmissionHistory[]>(res),
  )
}

// The diff between two form versions an admin needs in order to build a
// migration plan (US-6.1): which fields carry over automatically and which
// need an explicit mapping decision.
export function getMigrationPlan(
  formId: string,
  fromVersionId: string,
  targetVersionId: string,
): Promise<MigrationPlan> {
  const query = new URLSearchParams({ fromVersionId, targetVersionId })
  return fetch(
    `/api/forms/${formId}/submissions/migration-plan?${query}`,
  ).then((res) => json<MigrationPlan>(res))
}

// Migrates one submitted submission onto `targetVersionId` (US-6.1),
// creating a new submission linked back to the original rather than
// altering it in place.
export function migrateSubmission(
  formId: string,
  submissionId: string,
  targetVersionId: string,
  fieldMappings: FieldMapping[],
): Promise<Submission> {
  return fetch(`/api/forms/${formId}/submissions/${submissionId}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetVersionId, fieldMappings }),
  }).then((res) => json<Submission>(res))
}

// Migrates every submitted submission captured against `fromVersionId` onto
// `targetVersionId` using the same field-mapping plan (US-6.1). Safe to
// re-run -- submissions already migrated to that target are skipped.
export function migrateVersion(
  formId: string,
  fromVersionId: string,
  targetVersionId: string,
  fieldMappings: FieldMapping[],
): Promise<MigrationResult> {
  return fetch(`/api/forms/${formId}/versions/${fromVersionId}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetVersionId, fieldMappings }),
  }).then((res) => json<MigrationResult>(res))
}
