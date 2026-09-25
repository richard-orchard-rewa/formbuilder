import { useEffect, useMemo, useState } from "react"
import type { Field, FieldOption } from "shared"
import { getBindingOptions } from "../api.js"

// Fetches the live option list for every lookup-type data-bound field in
// `fields`, keyed by binding key -- the `bindingOptions` a SchemaContext
// needs to render them. A lookup whose options can't be fetched renders
// as a plain text input rather than blocking the form.
export function useBindingOptions(fields: Field[]) {
  const lookupKeys = useMemo(
    () =>
      [
        ...new Set(
          fields.flatMap((field) =>
            field.type === "bound" && field.binding.control.kind === "lookup"
              ? [field.binding.key]
              : [],
          ),
        ),
      ].sort(),
    [fields],
  )
  const cacheKey = lookupKeys.join("|")
  const [options, setOptions] = useState<Record<string, FieldOption[]>>({})

  useEffect(() => {
    if (lookupKeys.length === 0) return
    let cancelled = false
    Promise.all(
      lookupKeys.map((key) =>
        getBindingOptions(key)
          .then((result) => [key, result.options] as const)
          .catch(() => [key, []] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setOptions(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
    // Keyed on the set of lookups rather than the `fields` array's identity,
    // which changes on every edit in the builder.
  }, [cacheKey])

  return options
}
