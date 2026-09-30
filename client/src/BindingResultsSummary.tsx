import type { BindingCommitResult, BoundField, FieldOption } from "shared"

const RESULT_TEXT: Record<BindingCommitResult["status"], string> = {
  written: "Saved to ICIS",
  unchanged: "Unchanged",
  conflict: "Not saved — changed in ICIS since the form was opened",
  readOnly: "Display only",
  failed: "Not saved",
  skipped: "Not sent",
}

// After submit: what happened to each data-bound value. The submission
// itself is always recorded; a bound value that couldn't be written is
// reported here rather than failing the form.
export function BindingResultsSummary({
  fields,
  results,
  options,
  heading = "Client record",
}: {
  heading?: string
  fields: BoundField[]
  results: Record<string, BindingCommitResult>
  options: Record<string, FieldOption[]>
}) {
  const labelFor = (key: string, value: string | null | undefined) =>
    options[key]?.find((option) => option.value === value)?.label ??
    value ??
    "blank"

  return (
    <section className="binding-results" aria-label={`${heading} updates`}>
      <h2>{heading}</h2>
      <ul>
        {fields
          .filter((field) => results[field.binding.key])
          .map((field) => {
            const result = results[field.binding.key]
            return (
              <li
                key={field.id}
                className={`binding-results__item binding-results__item--${result.status}`}
              >
                <strong>{field.label}:</strong> {RESULT_TEXT[result.status]}
                {result.status === "conflict" && (
                  <> (ICIS now has “{labelFor(field.binding.key, result.current)}”)</>
                )}
                {result.message && result.status !== "conflict" && (
                  <span className="binding-results__message">
                    {" "}
                    — {result.message}
                  </span>
                )}
              </li>
            )
          })}
      </ul>
    </section>
  )
}
