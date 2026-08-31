# ADR-0004: Submission storage — typed columns vs. JSONB

## Status

Accepted

## Context

US-4.2 asks for a submission record to store its own metadata (form ID,
schema version ID, submitted data, timestamp, submitted-by) and for
"reportable/structured fields" to live in typed columns while "free-form/
variable fields" live in JSONB.

form-builder's field set per form is entirely admin-defined at runtime
(`shared`'s `FieldSchema` discriminated union, extensible per US-3.4) — a
form can have any number of fields of any supported type, added, reordered,
or removed at will. There is no fixed set of "the answer fields" known at
table-design time, so a real per-field typed column (one SQL column per
field) isn't possible without either a schema migration on every form edit
or a wide sparse table shared across all forms — both of which defeat the
whole point of a dynamic form builder.

What *is* fixed and known at table-design time is the submission's own
metadata: which form and version it targets, when it was submitted, and by
whom. That's exactly the "reportable/structured" half — the fields a query
would filter or group submissions by (`WHERE form_id = ...`,
`GROUP BY form_version_id`, `ORDER BY submitted_at`) — and it doesn't
change per form.

## Decision

Store submission metadata in typed columns (`form_id`, `form_version_id`,
`submitted_by`, `submitted_at`, plus `id`/`status`/timestamps) and the
actual admin-defined answer set in a single `data jsonb` column, keyed by
field id.

`form_id` is denormalized from `form_version_id` (rather than requiring a
join through `form_versions` for every query) since it's the column a
reporting view is most likely to filter or group by directly.

## Consequences

- Querying/reporting on submission metadata (by form, by version, by date,
  by submitter) uses plain typed-column SQL; no JSONB operators needed.
- Querying/reporting on individual answers (e.g. "how many people picked
  'Red'") requires JSONB operators (`data->>'field-id'`) against the
  relevant field's id, since the answer set has no fixed shape.
- If a future need arises to report heavily on one specific field across
  many forms (e.g. a universal "email" field), that field would need its
  own typed column and a deliberate decision to special-case it — not
  something this ADR covers.
