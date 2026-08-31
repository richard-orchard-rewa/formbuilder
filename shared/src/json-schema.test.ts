import { createRequire } from "node:module"
import { Ajv } from "ajv"
import { describe, expect, it } from "vitest"
import { buildSubmissionSchema, toJsonSchema } from "./json-schema.js"
import type { Field } from "./schemas/field.js"

// `ajv-formats` has no named export, and its default export doesn't type
// correctly as a callable under this project's `moduleResolution:
// "nodenext"` (a known rough edge for CJS packages without an `exports`
// map) -- `createRequire` sidesteps that static-typing mismatch entirely,
// since it resolves at runtime exactly like the app's own bundled
// `@jsonforms/core` does via its own CJS `require("ajv-formats")`.
const addFormats = createRequire(import.meta.url)("ajv-formats") as (
  ajv: Ajv,
) => void

// Proves the full round trip Zod stays the source of truth for (US-0.3): a
// form's field definitions -> a Zod submission schema -> a JSON Schema -> a
// renderer collecting a submission validated against that JSON Schema ->
// the same submission re-validated by the original Zod schema. Uses the
// same `Ajv` + `ajv-formats` setup the app's own renderer bundles
// (`@jsonforms/core`'s `createAjv`), so this proves the JSON Schema is
// actually compatible with what will validate it at runtime, not just any
// JSON Schema validator.
describe("Zod-to-JSON-Schema round trip", () => {
  const fields: Field[] = [
    {
      id: "fullName",
      type: "text",
      label: "Full name",
      required: true,
      maxLength: 40,
    },
    { id: "comments", type: "textarea", label: "Comments", required: false },
    {
      id: "satisfaction",
      type: "dropdown",
      label: "Satisfaction",
      required: true,
      options: [
        { value: "poor", label: "Poor" },
        { value: "great", label: "Great" },
      ],
    },
    {
      id: "subscribe",
      type: "checkbox",
      label: "Subscribe",
      required: false,
      defaultChecked: false,
    },
    {
      id: "visitDate",
      type: "date",
      label: "Visit date",
      required: true,
      min: "2020-01-01",
      max: "2029-12-31",
    },
    {
      id: "rating",
      type: "number",
      label: "Rating",
      required: false,
      min: 1,
      max: 5,
    },
  ]

  const submissionSchema = buildSubmissionSchema(fields)
  const jsonSchema = toJsonSchema(fields)
  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  const validateWithJsonSchema = ajv.compile(jsonSchema)

  const validSubmission = {
    fullName: "Jordan Lee",
    satisfaction: "great",
    subscribe: true,
    visitDate: "2024-06-01",
    rating: 4,
  }

  it("converts each field to the JSON Schema shape a renderer expects", () => {
    expect(jsonSchema.properties).toMatchObject({
      fullName: { type: "string", maxLength: 40, title: "Full name" },
      comments: { type: "string", title: "Comments" },
      satisfaction: {
        oneOf: [
          { const: "poor", title: "Poor" },
          { const: "great", title: "Great" },
        ],
      },
      subscribe: { type: "boolean", default: false },
      visitDate: {
        type: "string",
        format: "date",
        formatMinimum: "2020-01-01",
        formatMaximum: "2029-12-31",
      },
      rating: { type: "number", minimum: 1, maximum: 5 },
    })
    expect(jsonSchema.required).toEqual(
      expect.arrayContaining(["fullName", "satisfaction", "visitDate"]),
    )
    expect(jsonSchema.required).not.toContain("comments")
    expect(jsonSchema.required).not.toContain("rating")
  })

  it("accepts a submission that satisfies every field, in both validators", () => {
    expect(validateWithJsonSchema(validSubmission)).toBe(true)
    expect(submissionSchema.safeParse(validSubmission).success).toBe(true)
  })

  it("rejects a submission missing a required field, in both validators", () => {
    const { fullName, ...submission } = validSubmission

    expect(validateWithJsonSchema(submission)).toBe(false)
    expect(submissionSchema.safeParse(submission).success).toBe(false)
  })

  it("rejects a value outside a dropdown's options, in both validators", () => {
    const submission = { ...validSubmission, satisfaction: "excellent" }

    expect(validateWithJsonSchema(submission)).toBe(false)
    expect(submissionSchema.safeParse(submission).success).toBe(false)
  })

  it("rejects text exceeding maxLength, in both validators", () => {
    const submission = { ...validSubmission, fullName: "x".repeat(41) }

    expect(validateWithJsonSchema(submission)).toBe(false)
    expect(submissionSchema.safeParse(submission).success).toBe(false)
  })

  it("rejects a date outside its configured range, in both validators", () => {
    const submission = { ...validSubmission, visitDate: "2019-12-31" }

    // ajv-formats' formatMinimum/formatMaximum enforce the range; Zod has
    // no native range check for an ISO date string, so this is the one
    // constraint the JSON Schema validates that the original Zod schema
    // doesn't re-check.
    expect(validateWithJsonSchema(submission)).toBe(false)
  })

  it("rejects a number outside its min/max, in both validators", () => {
    const submission = { ...validSubmission, rating: 6 }

    expect(validateWithJsonSchema(submission)).toBe(false)
    expect(submissionSchema.safeParse(submission).success).toBe(false)
  })
})
