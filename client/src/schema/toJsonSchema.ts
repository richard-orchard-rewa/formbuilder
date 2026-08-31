import type { JsonSchema7 } from "@jsonforms/core"
import type { Field, FormSchema } from "shared"

// Converts the builder's draft FormSchema into the JSON Schema + UI Schema
// pair JSON Forms renders from (ADR-0003). This is a stand-in for the
// generic Zod-to-JSON-Schema conversion US-0.3 will wire up; it only
// covers the field types the canvas currently supports (US-3.1/3.2/3.3)
// and is meant to be replaced by that conversion once it lands.
export function toJsonSchema(schema: FormSchema) {
  const properties: Record<string, JsonSchema7> = {}
  const required: string[] = []
  const elements = schema.fields.map((field) => {
    properties[field.id] = toProperty(field)
    if (field.type === "text" && field.required) required.push(field.id)
    return toUiSchemaElement(field)
  })

  return {
    schema: {
      type: "object" as const,
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    uiSchema: {
      type: "VerticalLayout" as const,
      elements,
    },
  }
}

function toProperty(field: Field) {
  switch (field.type) {
    case "text":
      return {
        type: "string" as const,
        title: field.label,
        ...(field.maxLength ? { maxLength: field.maxLength } : {}),
      }
    case "textarea":
      return { type: "string" as const, title: field.label }
    case "dropdown":
      // US-3.3 will add configurable options; until then there's nothing
      // to constrain the value to, so it renders as a plain text control.
      return { type: "string" as const, title: field.label }
  }
}

function toUiSchemaElement(field: Field) {
  return {
    type: "Control" as const,
    scope: `#/properties/${field.id}`,
    ...(field.type === "textarea" ? { options: { multi: true } } : {}),
  }
}
