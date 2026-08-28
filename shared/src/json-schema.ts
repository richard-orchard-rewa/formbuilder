import { z } from "zod"
import type { FormDefinition, FormField } from "./schemas/form-field.js"

/**
 * Converts a Zod schema to JSON Schema using Zod's own built-in converter
 * (Zod 4+) rather than the third-party `zod-to-json-schema` package: it
 * needs no extra dependency, tracks Zod's own feature set exactly, and
 * outputs 2020-12 draft, which the ajv-based round trip below understands.
 */
export function toJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema)
}

function fieldToZod(field: FormField): z.ZodType {
  const value: z.ZodType =
    field.type === "dropdown"
      ? z.enum(field.options as [string, ...string[]])
      : z.string()
  return field.required ? value : value.optional()
}

/**
 * The single source of truth for what a valid submission to a given form
 * looks like. Built at runtime from the form's field definitions (stored as
 * `form_versions.schema`), so a form's own shape — not a fixed set of
 * columns — determines both the JSON Schema handed to the renderer and the
 * rule a submission is checked against.
 */
export function buildSubmissionSchema(definition: FormDefinition) {
  const shape: Record<string, z.ZodType> = {}
  for (const field of definition.fields) {
    shape[field.key] = fieldToZod(field)
  }
  return z.object(shape)
}
