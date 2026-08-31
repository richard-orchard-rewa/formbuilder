import type {
  Field,
  FormSchema,
  FormSummary,
  FormVersion,
  Submission,
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
): Promise<Submission> {
  const res = await fetch(`/api/forms/${formId}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  })
  if (res.status === 400) {
    const body = (await res.json()) as SubmissionValidationError
    throw new SubmissionRejectedError(body.missingFieldIds)
  }
  return json<Submission>(res)
}
