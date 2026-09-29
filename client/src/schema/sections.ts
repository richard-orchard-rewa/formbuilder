import type { SessionTemplateSchema, SessionTemplateSection } from "shared"

// A session template's sections, in order. Anything published before
// sections existed fills as one session-wide section of all its fields.
export function sectionsOf(schema: SessionTemplateSchema): SessionTemplateSection[] {
  return (
    schema.sections ?? [
      { moduleId: "all", moduleName: "", scope: "session", fields: schema.fields },
    ]
  )
}

// The participant-scoped values a submission holds, by participant anchor.
export function participantsOf(data: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const all = data.participants
  return all && typeof all === "object" ? (all as Record<string, Record<string, unknown>>) : {}
}
