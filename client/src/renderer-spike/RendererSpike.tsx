import { useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaCells, vanillaRenderers } from "@jsonforms/vanilla-renderers"

// US-0.2 spike: proves a JSON Schema-driven renderer can render a form
// built from the field types the canvas currently supports (US-3.1/3.2/3.3)
// without any hand-written form markup. The schema/uiSchema below are
// hand-written stand-ins for what US-0.3's Zod-to-JSON-Schema conversion
// will eventually generate from `shared`'s FieldSchema — this component
// only exercises the renderer, not that conversion step.
const schema = {
  type: "object",
  properties: {
    fullName: {
      type: "string",
      title: "Full name",
      maxLength: 80,
    },
    bio: {
      type: "string",
      title: "Bio",
    },
    favoriteColor: {
      type: "string",
      title: "Favorite color",
      enum: ["Red", "Green", "Blue"],
    },
  },
  required: ["fullName"],
}

const uiSchema = {
  type: "VerticalLayout",
  elements: [
    { type: "Control", scope: "#/properties/fullName" },
    {
      type: "Control",
      scope: "#/properties/bio",
      options: { multi: true },
    },
    { type: "Control", scope: "#/properties/favoriteColor" },
  ],
}

const renderers = [...vanillaRenderers]

export function RendererSpike() {
  const [data, setData] = useState<Record<string, unknown>>({})

  return (
    <div className="renderer-spike">
      <h2>JSON Forms renderer spike (US-0.2)</h2>
      <p>
        Renders a text field, a text area, and a dropdown from a JSON Schema
        + UI Schema — no hand-coded form markup.
      </p>
      <JsonForms
        schema={schema}
        uischema={uiSchema}
        data={data}
        renderers={renderers}
        cells={vanillaCells}
        onChange={({ data }) => setData(data)}
      />
      <h3>Live data</h3>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
