# ADR-0001: ORM and migration tooling for the Postgres data layer

## Status

Accepted

## Context

form-builder needs an ORM and a migration tool to manage the `forms`,
`form_versions`, and `submissions` tables in Postgres. The two realistic
options are Drizzle and Prisma.

- The project's data contracts are already defined with Zod (US-0.3 wires
  Zod-to-JSON-Schema conversion for form definitions), and form-builder's
  own monorepo scaffold (US-0.5) follows the same conventions as the
  organisation's `feedback` app, which already runs Drizzle against
  Postgres with the same `pg` driver — see
  [ADR-0002](0002-monorepo-scaffold.md). form-builder does not depend on or
  share a database with `feedback`; matching its tooling is for consistency
  of conventions only.
- Prisma generates its own client and query language from a separate schema
  DSL (`schema.prisma`), which duplicates the source of truth that Zod
  already provides here and adds a codegen step to every workflow.
- Drizzle's schema is plain TypeScript, queries are (mostly) plain SQL
  through a thin builder, and `drizzle-kit` diffs the TypeScript schema
  against the database to generate plain `.sql` migration files that are
  reviewable and reversible without a proprietary format.

## Decision

Use **Drizzle ORM** with **drizzle-kit** for schema definition and Postgres
migrations, matching the tooling conventions of the `feedback` app.

## Consequences

- Schema lives in `server/src/db/schema.ts`; migrations are generated with
  `npm run db:generate -w server` and applied with `npm run db:migrate -w server`,
  writing plain SQL files under `server/src/db/migrations/`.
- No generated client/codegen step is required — `drizzle-orm/node-postgres`
  reads the schema module directly.
