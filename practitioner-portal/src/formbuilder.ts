import type {
  SessionTemplateBindingContext,
  SessionTemplateSubmission,
  SessionTemplateSubmissionDetail,
  SessionTemplateSummary,
  SessionTemplateVersion,
} from "shared"
import { PRACTITIONER } from "./seed/notes"

// The portal's way to reach form-builder: the server's session-template API,
// relayed at /fb (vite.config.ts). Published templates come from here, and a
// completed note is stored here as a session-template submission -- which is
// also what sends its bound values on to the Data Binding Service.

const BASE = "/fb/api"

export class FormBuilderError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly missingFieldIds?: string[],
  ) {
    super(message)
    this.name = "FormBuilderError"
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new FormBuilderError(0, "form-builder is unavailable")
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = data as { message?: string; missingFieldIds?: string[] } | null
    throw new FormBuilderError(
      res.status,
      error?.message ?? (res.status >= 500 ? "form-builder is unavailable" : res.statusText),
      error?.missingFieldIds,
    )
  }
  return data as T
}

export interface PublishedTemplate {
  template: SessionTemplateSummary
  version: SessionTemplateVersion
}

// Every template that has a published version and isn't archived: the ones
// a practitioner can write a note with.
export async function listPublishedTemplates(): Promise<PublishedTemplate[]> {
  const templates = await call<SessionTemplateSummary[]>("GET", "/session-templates")
  const versions = await Promise.all(
    templates
      .filter((t) => t.archivedAt === null)
      .map(async (template) => ({
        template,
        version: await call<SessionTemplateVersion | null>("GET", `/session-templates/${template.id}/active`),
      })),
  )
  return versions.filter((t): t is PublishedTemplate => t.version !== null)
}

export const getPublishedTemplate = async (templateId: string): Promise<PublishedTemplate> => {
  const found = (await listPublishedTemplates()).find((t) => t.template.id === templateId)
  if (!found) throw new FormBuilderError(404, "That session template isn't published")
  return found
}

export const submitNote = (
  templateId: string,
  data: Record<string, unknown>,
  binding: SessionTemplateBindingContext,
) =>
  call<SessionTemplateSubmission>("POST", `/session-templates/${templateId}/submissions`, {
    data,
    submittedBy: PRACTITIONER.name,
    binding,
  })

export const getSubmission = (templateId: string, submissionId: string) =>
  call<SessionTemplateSubmissionDetail>("GET", `/session-templates/${templateId}/submissions/${submissionId}`)
