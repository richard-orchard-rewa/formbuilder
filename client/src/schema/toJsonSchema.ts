import type { JsonSchema7 } from "@jsonforms/core"
import type { Field, FormSchema } from "shared"

// Converts a FormSchema into the JSON Schema + UI Schema pair JSON Forms
// renders from (ADR-0003) — used for both the builder's draft preview
// (US-2.5) and the public fill-out view (US-4.1), so what an admin
// previews is exactly what a respondent later fills out. This is a
// stand-in for the generic Zod-to-JSON-Schema conversion US-0.3 will wire
// up, covering every field type the canvas currently supports (US-3.1
// through US-3.4); it's meant to be replaced by that conversion once it
// lands.
export function toJsonSchema(schema: FormSchema) {
  const properties: Record<string, JsonSchema7> = {}
  const required: string[] = []
  const elements = schema.fields.map((field) => {
    properties[field.id] = toProperty(field)
    if (field.required) required.push(field.id)
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

// A labeled list of options (dropdown/radio) becomes a `oneOf` of
// const/title pairs rather than a plain `enum`, so the option's label
// (not its raw value) is what renders.
function toOneOf(options: { value: string; label: string }[]) {
  return options.map((option) => ({
    const: option.value,
    title: option.label,
  }))
}

function toProperty(field: Field): JsonSchema7 {
  switch (field.type) {
    case "text":
      return {
        type: "string",
        title: field.label,
        ...(field.maxLength ? { maxLength: field.maxLength } : {}),
      }
    case "textarea":
      return {
        type: "string",
        title: field.label,
        ...(field.maxLength ? { maxLength: field.maxLength } : {}),
      }
    case "dropdown":
    case "radio":
      return {
        type: "string",
        title: field.label,
        ...(field.options.length > 0
          ? { oneOf: toOneOf(field.options) }
          : {}),
        ...(field.defaultValue ? { default: field.defaultValue } : {}),
      }
    case "checkbox":
      return {
        type: "boolean",
        title: field.label,
        default: field.defaultChecked,
      }
    case "date":
      return {
        type: "string",
        title: field.label,
        format: "date",
        ...(field.min ? { formatMinimum: field.min } : {}),
        ...(field.max ? { formatMaximum: field.max } : {}),
      }
    case "number":
      return {
        type: "number",
        title: field.label,
        ...(field.min !== undefined ? { minimum: field.min } : {}),
        ...(field.max !== undefined ? { maximum: field.max } : {}),
        ...(field.step ? { multipleOf: field.step } : {}),
      }
  }
}

function toUiSchemaElement(field: Field) {
  return {
    type: "Control" as const,
    scope: `#/properties/${field.id}`,
    ...(field.type === "textarea"
      ? {
          options: {
            multi: true,
            ...(field.placeholder ? { placeholder: field.placeholder } : {}),
            ...(field.rows ? { rows: field.rows } : {}),
          },
        }
      : {}),
    ...(field.type === "radio" ? { options: { format: "radio" } } : {}),
  }
}
