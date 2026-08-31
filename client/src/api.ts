import type { Field, FormSchema, FormSummary, FormVersion } from "shared"

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

export function getPublishedFieldIds(formId: string): Promise<string[]> {
  return fetch(`/api/forms/${formId}/published-field-ids`).then((res) =>
    json<string[]>(res),
  )
}
