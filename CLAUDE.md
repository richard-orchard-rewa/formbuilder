# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

form-builder is a standalone product for building schema-driven forms, publishing them, and collecting/editing submissions against them. See [README.md](README.md) for setup and [docs/adr/](docs/adr/) for the architecture decisions behind it.

It is **entirely separate** from the sibling `feedback` app — never edit, depend on, or share code or a database with that repo. Its structure and tooling (Fastify, one plugin per capability, Drizzle ORM, Zod-first shared contracts) took inspiration from `feedback`'s conventions (ADR-0002), and it's fine to read that repo for conventions to mirror, but nothing here should ever touch it.

## Repo conventions

- **Issues are user stories** named `US-<epic>.<n>` (e.g. `US-0.6`), each with acceptance criteria in the issue body.
- **Work happens per-issue** on branches `claude/github-issue-N[-suffix]`, opened as PRs against this repo's integration branch — **`claude/github-issue-24-14ff4b`, not `main`** (confirmed via `gh pr list`; there is a `main` branch in this repo, but nothing targets it). When one issue's work builds directly on another's still-open branch, stack the PR on that branch instead.
- **Always `npm ci`, never `npm install`, in CI** — enforces the lockfile.

## Monorepo structure

npm workspaces, four packages:

```
shared/     # Zod schemas and types — single source of truth for API contracts
server/     # Fastify backend
client/     # Vite + React frontend
e2e/        # Playwright feature tests, run against client + server together
```

## Commands

```bash
npm install                          # (or npm ci in CI)
npm run dev                          # server on :3000, client on :5173
npm run build                        # build all workspaces
npm run typecheck                    # tsc --noEmit across all workspaces
npm test                             # Vitest — shared + client
npm run test:e2e                     # Playwright — see e2e/playwright.config.ts
npm audit --omit=dev                 # what CI runs; dev-only advisories are out of scope
npm run db:generate -w server        # after changing server/src/db/schema.ts
npm run db:migrate -w server         # apply migrations to DATABASE_URL
```

Playwright starts both dev servers itself via `webServer` — it needs
`DATABASE_URL` pointing at an already-migrated Postgres (`docker compose up
-d` + `npm run db:migrate -w server` first). First-time browser install:
`npx playwright install chromium`.

## Architecture

### Backend — Fastify modular monolith (ADR-0001, ADR-0002)

One Fastify plugin per capability under `server/src/modules/<capability>/`, each following routes → service → repository, registered from `server/src/index.ts`:

```
server/src/
  db/
    schema.ts          # Drizzle table definitions
    migrations/        # drizzle-kit generated SQL
    client.ts
  modules/
    form-builder/
      routes.ts
      services/
      repositories/
    submissions/
      routes.ts
      services/
      repositories/
  deps.ts              # wires repositories -> services -> AppDeps
  index.ts             # registers module plugins
  server.ts            # entrypoint: reads DATABASE_URL, starts listening
```

Postgres schema is managed with Drizzle ORM + `drizzle-kit` (ADR-0001). After changing `server/src/db/schema.ts`: `npm run db:generate -w server` to produce a migration, then `npm run db:migrate -w server` to apply it.

### Frontend — Vite + React (ADR-0003)

Forms render from their JSON Schema via `@jsonforms/react` (ADR-0003) — the same renderer is used for the builder's live preview, the public fill-out view, and editing an existing submission, so all three always agree on layout and validation. The JSON Schema conversion in `client/src/schema/toJsonSchema.ts` wraps `shared`'s own `toJsonSchema` (ADR-0005).

Vitest + Testing Library cover client components (`client/src/*.test.tsx`, `client/src/test-setup.ts`, config in `client/vite.config.ts`'s `test` block).

### Shared contracts (ADR-0005)

Zod schemas in `shared/src/schemas/` are the single source of truth for a form's field definitions and a submission's shape. `shared/src/json-schema.ts` converts a field list to JSON Schema (`toJsonSchema`) and builds the matching Zod schema a submission is validated against server-side (`buildSubmissionSchema`) — proven round-trip in `shared/src/json-schema.test.ts`. `fastify-type-provider-zod` wires the same schemas into Fastify route validation on the server; the client imports the inferred TS types directly from `shared`.

### Submission storage (ADR-0004)

A form version is immutable once published (`status: "published"`); editing a draft never touches submissions already made against the currently-published version. Submissions store their data as JSONB against the exact form-version row they were captured with, so a submission always renders correctly even after the form is republished with a different structure.

## CI (US-0.6)

`.github/workflows/ci.yml` runs on every PR and on push to `claude/github-issue-24-14ff4b`:

- **static-analysis** — `npm ci`, build `shared`, `npm audit --omit=dev`, typecheck
- **unit-tests** — Vitest for `shared` + `client`
- **e2e** — Postgres service container, migrations, then the full Playwright suite

There is no lint/formatter config in this repo (unlike `feedback`) — don't add one speculatively; if that's ever wanted, it should be its own issue.

## Adding a new capability

1. Define Zod schemas in `shared/src/schemas/<capability>.ts` and export them from `shared/src/index.ts`.
2. Add `server/src/modules/<capability>/` with `routes.ts`, `services/`, `repositories/`.
3. Wire the repository → service in `server/src/deps.ts`, then register the route plugin in `server/src/index.ts`.
4. Add client API calls in `client/src/api.ts` and a component test alongside the component that uses them.
