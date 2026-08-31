import type { JsonSchema } from "@jsonforms/core"
import type { Field, FormSchema } from "shared"
import { toJsonSchema as fieldsToJsonSchema } from "shared"

// Converts a FormSchema into the JSON Schema + UI Schema pair JSON Forms
// renders from (ADR-0003) — used for both the builder's draft preview
// (US-2.5) and the public fill-out view (US-4.1), so what an admin
// previews is exactly what a respondent later fills out. The JSON Schema
// half is `shared`'s own Zod-to-JSON-Schema conversion (US-0.3) -- Zod
// stays the single source of truth for what a field's value looks like,
// rather than this hand-authoring the same shape a second time. The UI
// Schema half (layout/widget choice) has no Zod equivalent -- it's a JSON
// Forms-specific, rendering-only concern -- so it's still built here.
export function toJsonSchema(schema: FormSchema) {
  return {
    // The shared conversion's output is a plain JSON Schema object; cast
    // across the boundary to JSON Forms' own (structurally compatible)
    // type rather than duplicating its shape here.
    schema: fieldsToJsonSchema(schema.fields) as JsonSchema,
    uiSchema: {
      type: "VerticalLayout" as const,
      elements: schema.fields.map(toUiSchemaElement),
    },
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
