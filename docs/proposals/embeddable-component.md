# Proposal: form-builder as an embeddable component

## Status

Exploratory — not an ADR, not yet decided or scheduled. This is a sketch of
what it would take to let another application embed form-builder's
respondent-facing form/submission UI, or call its API as a service, at a
standard enterprise integrator would expect. Written up for future
reference; no implementation has started.

## Why this isn't an ADR

form-builder's ADRs (`docs/adr/`) record decisions already made about the
existing codebase. Nothing here has been decided — it's a forward-looking
option, kept as a doc rather than an ADR so it doesn't read as settled
architecture.

## What actually gets embedded

Two different audiences, so two different extraction targets:

- **Respondent-facing** (fill out a form, view/edit a submission) — the
  piece worth embedding *inside* another app's UI.
- **Admin-facing** (build forms, manage submissions, audit history) — a
  full app in its own right. Enterprise integrators typically redirect to a
  hosted admin UI (the Stripe Dashboard model) rather than embedding it, so
  this stays a standalone deployed app rather than an extraction target.

Everything below focuses on the respondent-facing piece.

## Layer 1 — Package boundary (`client`)

A new publishable package (e.g. `@rawa/form-builder-embed`), pulling the
app-agnostic parts out of `client/src/`:

- `<FormFill>` and `<SubmissionEditor>` components — today's logic in
  `FormFill.tsx` / `SubmissionEdit.tsx`, minus the `App.tsx` routing shell
  around them.
- The `toJsonSchema` conversion and JSONForms renderer wiring
  (`client/src/schema/`).
- A typed API client, built on `shared`'s Zod schemas — validated at
  runtime on the client too, not just server-side, since a third-party host
  app is now a hard trust boundary.
- **Theming**: today `App.css` / `rawa-tokens.css` hardcode the RAWA look
  directly onto JSONForms' output. That has to become CSS custom properties
  (or a `theme` prop) with RAWA as the *default*, not the *only*, theme — a
  host app needs to restyle without forking.
- Built dual ESM/CJS, React as a peer dependency (not bundled), types
  shipped, tree-shakeable.

`shared` becomes its own published package too
(`@rawa/form-builder-contracts`), since the embed package and any
integrator's own backend code both need those types.

## Layer 2 — The API becomes multi-tenant (`server`)

This is the real gap, and the one that can't be skipped. Right now there's
**no auth and no tenancy at all** — any caller can read or write any form.
For genuine cross-application use:

- **Auth**: API keys per integrating application, or OAuth2
  client-credentials for service-to-service calls. A Fastify `onRequest`
  hook verifying identity before every route.
- **Tenancy**: add `organizationId` to `forms`, cascading through
  `form_versions` / `submissions` / `submission_history`, with every
  repository query scoped by it from a request-derived context — never a
  client-supplied id. This touches nearly every `WHERE` clause in the
  repositories, so it's a real migration, not a config flag.
- **Identity, not free strings**: `submittedBy` / `editedBy` / `publishedBy`
  are currently caller-supplied freeform text (explicitly called out in the
  code comments as a stand-in for "no auth system yet"). Once there's real
  auth, these need to become verified identity claims — otherwise the
  SCD Type 2 audit trail (US-6.1–6.4) is trivially spoofable, which defeats
  the point of an audit trail in an enterprise context.
- **CORS + rate limiting**: per-tenant origin allow-lists (the embedded
  widget calls the API cross-origin from the host's domain) and per-tenant
  quotas.

## Layer 3 — Operational maturity

- **API versioning** (`/v1/...`) so `shared`'s schema evolution doesn't
  silently break integrators — pairs with semver and a changelog on the
  published packages.
- **Observability**: structured logs with tenant/request correlation ids,
  metrics, tracing. Today it's Fastify's default pino logging with nothing
  tenant-aware.
- **Data lifecycle**: `submission_history` grows unbounded by design
  (SCD Type 2) — enterprise use needs a retention/archival policy, not just
  "keep everything forever."
- **DB scaling**: connection pool limits per tenant, read replicas for
  reporting queries once there's more than one customer hitting it.

## Layer 4 — Security posture for running inside someone else's page

- CSP-friendly output (no inline styles/scripts — JSONForms' vanilla
  renderer should already satisfy this, but needs verifying once themed).
- For integrators wary of running your JS inside their bundle (version
  conflicts, dependency trust, blast radius) — offer an **iframe +
  postMessage** integration as a lower-trust, lower-effort alternative to
  the npm package. Enterprise buyers often prefer this over "install our
  React component" for exactly that reason.

## Suggested order

1. Extract `shared` as its own package and add `/v1` API versioning —
   low-risk, mostly mechanical.
2. Add real auth and tenancy — the actual prerequisite; nothing else
   matters until this exists.
3. Extract the themeable `<FormFill>` / `<SubmissionEditor>` package.
4. Add the iframe/web-component wrapper for low-integration-effort
   consumers.
5. Observability and retention hardening, ongoing in parallel.
