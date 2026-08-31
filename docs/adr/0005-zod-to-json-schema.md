# ADR-0005: Zod-to-JSON-Schema conversion

## Status

Accepted

## Context

US-0.3 asks for `zod-to-json-schema` to be integrated into `shared/` so
Zod stays the single source of truth for form contracts, with the JSON
Schema output driving the form renderer chosen in ADR-0003 and a
submission validated back against it.

The `zod-to-json-schema` npm package predates Zod 4. Zod 4.4.3 (already the
version pinned here, see ADR-0001) ships its own built-in converter,
`z.toJSONSchema()`.

## Decision

Use Zod's built-in `z.toJSONSchema()`, wrapped by `toJsonSchema()` in
[`shared/src/json-schema.ts`](../../shared/src/json-schema.ts), instead of
the third-party `zod-to-json-schema` package named in the issue. This is a
deliberate deviation from the literal acceptance criterion: the built-in
converter needs no extra dependency and can't drift out of sync with
whatever Zod features are used.

`fieldValueSchema()` builds, from one of `shared`'s `Field` definitions,
the Zod schema for what a valid *answer* to that field looks like (not the
field definition itself). `buildSubmissionSchema()` assembles a form's
full field list into one Zod object schema — the actual runtime source of
truth for what a submission must look like, replacing the client's
previous hand-authored, per-field-type JSON Schema builder. `toJsonSchema()`
converts that to JSON Schema for the renderer.

Two deviations from a bare `z.toJSONSchema()` call, both using its
sanctioned extension points rather than post-processing its output:

- **Option labels.** A `dropdown`/`radio` field's options need their label
  (not just their value) to reach the renderer, so JSON Forms can show
  "Great" instead of `"great"`. A plain `z.enum()` only carries values, so
  each option becomes its own `z.literal(value).meta({ title: label })`
  branch in a `z.union()` instead. Zod converts a union to `anyOf` by
  default; JSON Forms specifically looks for `oneOf`
  (`isOneOfEnumSchema`) to treat it as a labeled-enum control, so the
  `override` callback renames a literal-only `anyOf` to `oneOf` on the way
  out.
- **Date range.** Zod has no native range check for an ISO date string
  (`z.iso.date()`), but the renderer's bundled `ajv-formats` plugin
  understands the non-standard `formatMinimum`/`formatMaximum` JSON Schema
  keywords. `.meta()` merges arbitrary keys directly onto its schema's
  JSON Schema output, so a date field's `min`/`max` are attached that way.

Targets `draft-07` (`z.toJSONSchema`'s `target` option) rather than the
default `draft-2020-12`, to match the draft the renderer's bundled Ajv
instance (`@jsonforms/core`'s `createAjv`, a plain `Ajv` v8, not `Ajv2020`)
validates against by default.

The round trip — field definitions → Zod submission schema → JSON Schema →
a submission validated against the JSON Schema with the same `Ajv` +
`ajv-formats` setup the renderer bundles → the same submission re-validated
by the original Zod schema — is proven in
[`shared/src/json-schema.test.ts`](../../shared/src/json-schema.test.ts)
(`npm run test -w shared`).

## Consequences

- `shared/src/json-schema.ts` exports `toJsonSchema()` and
  `buildSubmissionSchema()`. `client/src/schema/toJsonSchema.ts` now calls
  the former for a form's JSON Schema instead of hand-authoring it, and
  only builds the JSON Forms-specific UI Schema (layout, widget choice)
  itself — that half has no Zod equivalent.
- `shared/`'s test tooling is `vitest`, with `ajv` and `ajv-formats` as
  dev-only dependencies for the round-trip proof (not used at runtime by
  `shared` itself — the app's actual renderer brings its own via
  `@jsonforms/core`).
- A new field type (US-3.4 onward) needs a matching `fieldValueSchema()`
  case here, alongside its JSON Forms renderer (ADR-0003) and canvas/
  inspector UI.
