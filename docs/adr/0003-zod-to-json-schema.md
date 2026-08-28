# ADR-0003: Zod-to-JSON-Schema conversion

## Status

Accepted

## Context

US-0.3 asks for `zod-to-json-schema` to be integrated into `shared/` so Zod
stays the single source of truth for form contracts, with the JSON Schema
output driving a form renderer (US-0.2) and a submission validated back
against it.

The `zod-to-json-schema` npm package predates Zod 4. Zod 4.4.3 (already the
version pinned here, see [ADR-0001](0001-orm-selection.md)) ships its own
built-in converter, `z.toJSONSchema()`.

## Decision

Use Zod's built-in `z.toJSONSchema()`, wrapped by `toJsonSchema()` in
[`shared/src/json-schema.ts`](../../shared/src/json-schema.ts), instead of
the third-party `zod-to-json-schema` package named in the issue.

This is a deliberate deviation from the literal acceptance criterion: the
built-in converter needs no extra dependency, can't drift out of sync with
whatever Zod features are used, and outputs JSON Schema 2020-12, which the
round-trip test validates with `ajv`.

## Consequences

- `shared/src/json-schema.ts` exports `toJsonSchema()` (Zod schema → JSON
  Schema) and `buildSubmissionSchema()`, which builds the Zod schema for a
  form's submissions from its field definitions
  (`shared/src/schemas/form-field.ts`) at runtime — the actual source of
  truth is the form's own field list, not a fixed schema.
- The round trip — field definitions → Zod submission schema → JSON Schema
  → a submission validated against the JSON Schema → the same submission
  re-validated by the original Zod schema — is proven in
  `shared/src/json-schema.test.ts` (`npm run test -w shared`). A JSON
  Schema-driven renderer is chosen separately in US-0.2; `ajv` stands in
  here for "the renderer's own validation" against the same JSON Schema it
  would receive.
