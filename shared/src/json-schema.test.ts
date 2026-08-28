import { describe, expect, it } from "vitest"
import { Ajv2020 } from "ajv/dist/2020.js"
import { buildSubmissionSchema, toJsonSchema } from "./json-schema.js"
import type { FormDefinition } from "./schemas/form-field.js"

// Proves the full round trip Zod stays the source of truth for (US-0.3):
// a form's field definitions -> a Zod submission schema -> a JSON Schema ->
// a renderer collecting a submission against that JSON Schema -> the same
// submission re-validated by the original Zod schema. ajv stands in for
// "the renderer's own validation", since the JSON Schema-driven renderer
// itself is chosen in US-0.2.
describe("Zod-to-JSON-Schema round trip", () => {
  const definition: FormDefinition = {
    fields: [
      { type: "text", key: "fullName", label: "Full name", required: true },
      {
        type: "textarea",
        key: "comments",
        label: "Comments",
        required: false,
      },
      {
        type: "dropdown",
        key: "satisfaction",
        label: "Satisfaction",
        required: true,
        options: ["poor", "average", "great"],
      },
    ],
  }

  const submissionSchema = buildSubmissionSchema(definition)
  const jsonSchema = toJsonSchema(submissionSchema)
  const ajv = new Ajv2020({ allErrors: true })
  const validateWithJsonSchema = ajv.compile(jsonSchema)

  it("converts each field to the JSON Schema shape a renderer expects", () => {
    expect(jsonSchema.properties).toMatchObject({
      fullName: { type: "string" },
      comments: { type: "string" },
      satisfaction: { enum: ["poor", "average", "great"] },
    })
    expect(jsonSchema.required).toEqual(
      expect.arrayContaining(["fullName", "satisfaction"]),
    )
    expect(jsonSchema.required).not.toContain("comments")
  })

  it("accepts a submission that satisfies the rendered fields, in both validators", () => {
    const submission = {
      fullName: "Jordan Lee",
      satisfaction: "great",
    }

    expect(validateWithJsonSchema(submission)).toBe(true)

    const result = submissionSchema.safeParse(submission)
    expect(result.success).toBe(true)
  })

  it("rejects a submission missing a required field, in both validators", () => {
    const submission = { comments: "no name given" }

    expect(validateWithJsonSchema(submission)).toBe(false)

    const result = submissionSchema.safeParse(submission)
    expect(result.success).toBe(false)
  })

  it("rejects a submission with a value outside the dropdown's options, in both validators", () => {
    const submission = { fullName: "Jordan Lee", satisfaction: "excellent" }

    expect(validateWithJsonSchema(submission)).toBe(false)

    const result = submissionSchema.safeParse(submission)
    expect(result.success).toBe(false)
  })
})
