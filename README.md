# formbuilder

A standalone npm-workspaces monorepo (`client/`, `server/`, `shared/`). Its
structure and tooling choices (Fastify, one plugin per capability, Drizzle
ORM, Zod-first contracts shared between client and server) take inspiration
from the conventions of the `feedback` app, but this project is entirely
separate — it does not depend on, share code with, or modify that repo.

## Getting started

Double-click [`start.bat`](start.bat) (Windows, requires Docker Desktop to be
running) to bring up Postgres, install dependencies and apply migrations on
first run, start both dev servers, and open the app in your browser once
it's ready.

To run the same steps by hand instead:

```bash
npm install
docker compose up -d          # local Postgres on :5432
cp server/.env.example server/.env
npm run db:migrate -w server   # apply server/src/db/migrations to DATABASE_URL
npm run dev                    # server on :3000, client on :5173
```

## Testing

```bash
npm test                        # Vitest — shared + client
npm run typecheck                # tsc --noEmit across all workspaces
npm run test:e2e                 # Playwright — needs Postgres migrated (see above)
```

Playwright starts both dev servers itself via `webServer` — see
[`e2e/playwright.config.ts`](e2e/playwright.config.ts). First-time browser
install: `npx playwright install chromium`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull
request and on push to this repo's integration branch
(`claude/github-issue-24-14ff4b` — see [CLAUDE.md](CLAUDE.md)): dependency
install + `npm audit --omit=dev` + typecheck, then unit tests, then the
Playwright suite against a Postgres service container. See
[US-0.6](https://github.com/richard-orchard-rewa/formbuilder/issues/26).

## Data layer

Postgres schema is managed with [Drizzle ORM](https://orm.drizzle.team) and
`drizzle-kit` — see [ADR-0001](docs/adr/0001-orm-selection.md) for why.

Schema lives in [`server/src/db/schema.ts`](server/src/db/schema.ts). After
changing it, run `npm run db:generate -w server` to produce a new SQL
migration under `server/src/db/migrations/`, then `npm run db:migrate -w server`
to apply it.

## Form contracts

Zod is the single source of truth for a form's field definitions
(`shared/src/schemas/field.ts`). `shared/src/json-schema.ts` converts those
to JSON Schema (`toJsonSchema`) for the renderer, and builds the matching
Zod schema a submission is validated against (`buildSubmissionSchema`) —
see [ADR-0005](docs/adr/0005-zod-to-json-schema.md). The round trip is
proven in `shared/src/json-schema.test.ts`:

```bash
npm run test -w shared
```

## Layout

- `shared/` — Zod schemas and types used by both `client` and `server`.
- `server/` — Fastify app. Each feature capability is one plugin under
  `server/src/modules/<capability>/` (routes → service → repository), mounted
  from `server/src/index.ts`.
- `client/` — Vite + React app.
- `e2e/` — Playwright feature tests, run against `client` and `server`
  together (see [Testing](#testing)).
