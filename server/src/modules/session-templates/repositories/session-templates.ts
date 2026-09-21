export interface SessionTemplateRow {
  id: string
  name: string
  description: string | null
  archivedAt: Date | null
  createdAt: Date
}

export interface CreateSessionTemplateInput {
  name: string
  description?: string | null
}

// One module in a template's current composition, in order.
export interface SessionTemplateModuleRow {
  moduleId: string
  name: string
  position: number
}

export class SessionTemplateNotFoundError extends Error {
  constructor(sessionTemplateId: string) {
    super(`No session template found with id ${sessionTemplateId}`)
    this.name = "SessionTemplateNotFoundError"
  }
}

export interface SessionTemplatesRepository {
  // Lists non-archived session templates (US-8.6), optionally narrowed by
  // a substring, case-insensitive search over `name`.
  list(query?: string): Promise<SessionTemplateRow[]>

  create(input: CreateSessionTemplateInput): Promise<SessionTemplateRow>

  archive(sessionTemplateId: string): Promise<SessionTemplateRow>

  // The template's current composition, ordered by position (US-8.2).
  // Throws if the template doesn't exist.
  getComposition(sessionTemplateId: string): Promise<SessionTemplateModuleRow[]>

  // Replaces the template's whole composition in one call, positioning
  // each module by its order in `moduleIds` (US-8.2). Throws if the
  // template doesn't exist; the caller is responsible for validating each
  // module id is a real, published module before calling this.
  setComposition(
    sessionTemplateId: string,
    moduleIds: string[],
  ): Promise<SessionTemplateModuleRow[]>
}
