import {
  isBoundField,
  type BindingAnchor,
  type BoundField,
  type Field,
  type SessionAnchor,
  type SessionTemplateBindingContext,
  type SessionTemplateSchema,
  type SessionTemplateSection,
} from "shared"

// A session note built from a form-builder session template: the template's
// sections (one per module) filled in once for the session, or once for each
// participant. The values are the same shape form-builder's own fill-out
// submits, so form-builder stores the note and writes the bound values on to
// the Data Binding Service.

export type Data = Record<string, unknown>

// A template's sections, in order. Anything published before sections
// existed fills as one session-wide section of all its fields.
export function sectionsOf(schema: SessionTemplateSchema): SessionTemplateSection[] {
  return schema.sections ?? [{ moduleId: "all", moduleName: "", scope: "session", fields: schema.fields }]
}

export const fieldsOfScope = (sections: SessionTemplateSection[], scope: "session" | "participant") =>
  sections.filter((s) => s.scope === scope).flatMap((s) => s.fields)

export const boundOn = (fields: Field[], anchor: BindingAnchor): BoundField[] =>
  fields.filter(isBoundField).filter((field) => field.binding.anchor === anchor)

// The answers a field starts with: a dropdown/radio's default option and a
// checkbox's default state.
export function defaultsFor(fields: Field[]): Data {
  const data: Data = {}
  for (const field of fields) {
    if ((field.type === "dropdown" || field.type === "radio") && field.defaultValue !== undefined) {
      data[field.id] = field.defaultValue
    } else if (field.type === "checkbox" && field.defaultChecked) {
      data[field.id] = true
    }
  }
  return data
}

const isEmpty = (value: unknown) => value === undefined || value === null || value === ""

// Labels of the required fields with no answer, for the message shown before
// a submit. form-builder's server checks the same rule again.
export function missingRequired(
  sections: SessionTemplateSection[],
  sessionData: Data,
  participantData: Record<string, Data>,
  session: SessionAnchor,
): string[] {
  const missing: string[] = []
  for (const section of sections) {
    const label = (field: Field, who?: string) =>
      `${section.moduleName ? `${section.moduleName}: ` : ""}${field.label}${who ? ` (${who})` : ""}`
    if (section.scope === "session") {
      for (const field of section.fields) {
        if (field.required && isEmpty(sessionData[field.id])) missing.push(label(field))
      }
    } else {
      for (const p of session.participants) {
        for (const field of section.fields) {
          if (field.required && isEmpty(participantData[p.id]?.[field.id])) {
            missing.push(label(field, p.client.displayName))
          }
        }
      }
    }
  }
  return missing
}

// What form-builder's submit takes: the session-wide values, plus each
// participant's own under `participants[<participant anchor id>]`.
export function submissionData(
  sections: SessionTemplateSection[],
  sessionData: Data,
  participantData: Record<string, Data>,
  session: SessionAnchor,
): Data {
  const hasParticipantSections = sections.some((s) => s.scope === "participant")
  return {
    ...sessionData,
    ...(hasParticipantSections
      ? { participants: Object.fromEntries(session.participants.map((p) => [p.id, participantData[p.id] ?? {}])) }
      : {}),
  }
}

export const bindingContext = (
  session: SessionAnchor,
  baseline: SessionTemplateBindingContext["baseline"],
): SessionTemplateBindingContext => ({
  session: session.id,
  participants: session.participants.map((p) => ({ participant: p.id, client: p.client.id })),
  baseline,
})
