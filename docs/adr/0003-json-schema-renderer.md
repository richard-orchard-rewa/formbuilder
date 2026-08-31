# ADR-0003: JSON Schema-driven form renderer

## Status

Accepted

## Context

form-builder needs to render a form from its schema (`FormSchema` /
`Field[]` in `shared`) without hand-coding a component per field type, so
Epic 3's field types (US-3.1–3.5) plug into rendering the same way they
plug into the builder canvas. The two realistic JSON Schema-driven React
renderers are JSON Forms (`@jsonforms/react`) and RJSF
(`react-jsonschema-form` / `@rjsf/core`).

- Both consume a JSON Schema for data shape/validation. JSON Forms adds a
  separate UI Schema for layout and widget choice per field; RJSF instead
  layers `uiSchema` options onto the same JSON Schema tree. The separate UI
  Schema is a closer fit for this project: the builder's field
  configuration (label, placeholder, required, per-type options) is
  naturally a layout/presentation concern distinct from the JSON Schema
  that US-0.3 will generate from `shared`'s Zod field schemas, so the two
  can be generated independently instead of interleaving builder-specific
  options into the data schema.
- JSON Forms registers renderers as `(tester, renderer)` pairs, where a
  tester scores how well a renderer matches a given schema/UI Schema
  fragment. That maps directly onto `field.ts`'s "extensible type registry"
  design (adding a field type there means adding a matching JSON Forms
  renderer, without touching existing ones). RJSF's equivalent is naming a
  custom `widget` in `uiSchema`, which works but is a naming convention
  rather than a scored match, and doesn't compose as cleanly for
  discriminated-union-shaped fields like `dropdown` (needs an
  `enum`-specific renderer) versus `textarea` (needs a `multi`-line text
  renderer) coexisting with the plain `text` renderer.
- JSON Forms ships a dependency-free `vanilla-renderers` set (plain HTML
  controls, no UI kit required), which fits form-builder's plain-CSS
  styling; RJSF's core theme is also framework-free but its more complete
  themes pull in Bootstrap or Material UI, which this project does not use
  elsewhere.
- Both support React 19 as installed here.

## Decision

Use **JSON Forms** (`@jsonforms/core`, `@jsonforms/react`,
`@jsonforms/vanilla-renderers`) as the form renderer.

A spike (`client/src/renderer-spike/RendererSpike.tsx`, reachable from the
"View renderer spike" button on the forms list) proves it against a
hand-written sample schema covering all three field types the canvas
currently supports: `text` (plain string control), `textarea` (string
control with the `multi` UI Schema option), and `dropdown` (string `enum`
control). The schema/UI Schema pair there stand in for what US-0.3's
Zod-to-JSON-Schema conversion will generate; this spike only exercises the
renderer itself.

## Consequences

- `client/package.json` depends on `@jsonforms/core`, `@jsonforms/react`,
  and `@jsonforms/vanilla-renderers`.
- Rendering a live form (Epic 4) will generate a JSON Schema + UI Schema
  pair from `shared`'s `FormSchema`/`Field` types (per US-0.3) and pass them
  to `<JsonForms>` with the vanilla renderer set, rather than hand-writing a
  component per field type.
- A new field type (US-3.4 onward) needs a matching JSON Forms renderer
  (tester + renderer pair) registered alongside the vanilla set, mirroring
  how it plugs into the builder's canvas and palette.
