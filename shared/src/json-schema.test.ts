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

// Data-bound fields (docs/proposals/databound-fields.md): the control comes
// from the snapshotted dictionary entry, a lookup's options are supplied at
// render time by the caller, and a read-only binding is marked readOnly and
// never required.
describe("data-bound fields", () => {
  const binding = {
    version: 1,
    description: "",
    anchor: "client" as const,
    overridable: ["label" as const, "required" as const],
  }
  const fields: Field[] = [
    {
      id: "first",
      type: "bound",
      label: "Given name",
      required: true,
      binding: {
        ...binding,
        key: "client.firstName",
        label: "First name",
        access: "readWrite",
        control: { kind: "text", maxLength: 5 },
      },
    },
    {
      id: "title",
      type: "bound",
      label: "Title",
      required: false,
      binding: {
        ...binding,
        key: "client.title",
        label: "Title",
        access: "readWrite",
        control: { kind: "lookup" },
      },
    },
    {
      id: "number",
      type: "bound",
      label: "Client number",
      required: true,
      binding: {
        ...binding,
        key: "client.clientNumber",
        label: "Client number",
        access: "read",
        control: { kind: "text" },
      },
    },
  ]
  const context = {
    bindingOptions: { "client.title": [{ value: "mr-id", label: "Mr" }] },
  }
  const json = toJsonSchema(fields, context) as {
    properties: Record<string, Record<string, unknown>>
    required?: string[]
  }
  const schema = buildSubmissionSchema(fields, context)

  it("uses the builder's label and the dictionary's length limit", () => {
    expect(json.properties.first).toMatchObject({
      type: "string",
      title: "Given name",
      maxLength: 5,
    })
    expect(schema.safeParse({ first: "Alexandra" }).success).toBe(false)
  })

  it("renders a lookup from the options supplied at render time", () => {
    expect(json.properties.title.oneOf).toEqual([
      { type: "string", const: "mr-id", title: "Mr" },
    ])
    expect(schema.safeParse({ first: "Bob", title: "nope" }).success).toBe(false)
  })

  it("marks a read-only binding readOnly and never requires it", () => {
    expect(json.properties.number.readOnly).toBe(true)
    expect(json.required).toEqual(["first"])
    expect(schema.safeParse({ first: "Bob" }).success).toBe(true)
  })
})
