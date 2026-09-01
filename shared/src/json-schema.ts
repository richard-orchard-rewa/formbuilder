import { z } from "zod"
import type { Field } from "./schemas/field.js"

// Builds the Zod schema for one field's own answer value -- what a
// submission's value for this field must look like -- from its definition
// (`shared`'s `Field` union, the single source of truth for a form's
// shape). This is the piece US-0.3 wires up: everything downstream (the
// JSON Schema handed to the renderer, and the rule a submission is
// validated against) is derived from this, not hand-authored per type.
function fieldValueSchema(field: Field): z.ZodType {
  const withRequired = <T extends z.ZodType>(schema: T) =>
    field.required ? schema : schema.optional()

  switch (field.type) {
    case "text":
    case "textarea": {
      let schema = z.string()
      if (field.maxLength) schema = schema.max(field.maxLength)
      return withRequired(schema.meta({ title: field.label }))
    }
    case "dropdown":
    case "radio": {
      // A labeled union of literals (rather than a plain `z.enum`) so each
      // option's label -- not just its value -- survives into the JSON
      // Schema, for a renderer to show instead of the raw value.
      let schema: z.ZodType =
        field.options.length > 0
          ? z.union(
              field.options.map((option) =>
                z.literal(option.value).meta({ title: option.label }),
              ),
            )
          : z.string()
      schema = schema.meta({ title: field.label })
      if (field.defaultValue !== undefined) {
        schema = schema.default(field.defaultValue)
      }
      return withRequired(schema)
    }
    case "checkbox":
      return withRequired(
        z
          .boolean()
          .meta({ title: field.label })
          .default(field.defaultChecked),
      )
    case "date": {
      const schema = z.iso.date().meta({
        title: field.label,
        // Not native Zod constraints (Zod has no date-range check for an
        // ISO date string) -- merged onto the JSON Schema output as the
        // `formatMinimum`/`formatMaximum` keywords ajv-formats understands,
        // matching what the renderer's own validation enforces.
        ...(field.min ? { formatMinimum: field.min } : {}),
        ...(field.max ? { formatMaximum: field.max } : {}),
      })
      return withRequired(schema)
    }
    case "number": {
      let schema = z.number()
      if (field.min !== undefined) schema = schema.min(field.min)
      if (field.max !== undefined) schema = schema.max(field.max)
      if (field.step) schema = schema.multipleOf(field.step)
      return withRequired(schema.meta({ title: field.label }))
    }
  }
}

// The single source of truth for what a valid submission to a given form
// looks like. Built at runtime from the form's own field list (stored as
// `form_versions.schema`) rather than a fixed set of columns, so this is
// both the rule a submission is validated against and, via `toJsonSchema`
// below, what a JSON Schema-driven renderer renders from (US-0.3).
export function buildSubmissionSchema(fields: Field[]) {
  const shape: Record<string, z.ZodType> = {}
  for (const field of fields) {
    shape[field.id] = fieldValueSchema(field)
  }
  return z.object(shape)
}

// Converts a Zod schema to JSON Schema using Zod's own built-in converter
// (Zod 4+) rather than the third-party `zod-to-json-schema` package: it
// needs no extra dependency and can't drift out of sync with whatever Zod
// features are used. Targets draft-07 to match the draft the renderer's
// bundled ajv validates against by default (Ajv 8's `Ajv` class, as
// opposed to `Ajv2020`).
//
// A labeled option union (`dropdown`/`radio` above) converts to `anyOf` by
// default; JSON Forms specifically looks for `oneOf` to treat it as an
// enum-with-labels control (`isOneOfEnumSchema`), so every literal-union
// branch is renamed from `anyOf` to `oneOf` on the way out.
export function toJsonSchema(fields: Field[]) {
  return z.toJSONSchema(buildSubmissionSchema(fields), {
    target: "draft-07",
    override: (ctx) => {
      const json = ctx.jsonSchema as { anyOf?: unknown[]; oneOf?: unknown[] }
      if (
        Array.isArray(json.anyOf) &&
        json.anyOf.every(
          (branch) =>
            typeof branch === "object" && branch !== null && "const" in branch,
        )
      ) {
        json.oneOf = json.anyOf
        delete json.anyOf
      }
    },
  })
}
