import { useMemo, useState } from "react"
import { JsonForms } from "@jsonforms/react"
import { vanillaCells, vanillaRenderers } from "@jsonforms/vanilla-renderers"
import type { Field } from "shared"
import { toJsonSchema } from "./schema/toJsonSchema.js"

interface FormPreviewProps {
  fields: Field[]
}

// Renders the draft schema with the same JSON Forms renderer end users
// will see (ADR-0003), so an admin can check layout and behaviour before
// publishing (US-2.5). Input here is scratch state only — nothing is
// persisted from the preview.
export function FormPreview({ fields }: FormPreviewProps) {
  const { schema, uiSchema } = useMemo(
    () => toJsonSchema({ fields }),
    [fields],
  )
  const [data, setData] = useState<Record<string, unknown>>({})

  return (
    <div className="form-preview">
      {fields.length === 0 ? (
        <p className="form-preview__empty">
          Add a field to the canvas to preview the form.
        </p>
      ) : (
        <JsonForms
          schema={schema}
          uischema={uiSchema}
          data={data}
          renderers={vanillaRenderers}
          cells={vanillaCells}
          onChange={({ data }) => setData(data)}
        />
      )}
    </div>
  )
}
