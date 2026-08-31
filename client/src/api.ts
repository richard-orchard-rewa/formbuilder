import type {
  Field,
  FormSchema,
  FormSummary,
  FormVersion,
  Submission,
  SubmissionDetail,
  SubmissionEdit,
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

// A bare-bones list of a form's submissions, just enough to navigate to
// one (US-5.1). Filtering/richer columns are US-5.3's job.
export function listSubmissions(formId: string): Promise<SubmissionSummary[]> {
  return fetch(`/api/forms/${formId}/submissions`).then((res) =>
    json<SubmissionSummary[]>(res),
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

// The edit history for one submission, most recent first (US-5.2).
export function getSubmissionEdits(
  formId: string,
  submissionId: string,
): Promise<SubmissionEdit[]> {
  return fetch(`/api/forms/${formId}/submissions/${submissionId}/edits`).then(
    (res) => json<SubmissionEdit[]>(res),
  )
}
