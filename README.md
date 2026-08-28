# formbuilder

A standalone npm-workspaces monorepo (`client/`, `server/`, `shared/`). Its
structure and tooling choices (Fastify, one plugin per capability, Drizzle
ORM, Zod-first contracts shared between client and server) take inspiration
from the conventions of the `feedback` app, but this project is entirely
separate — it does not depend on, share code with, or modify that repo.

## Getting started

```bash
npm install
docker compose up -d          # local Postgres on :5432
cp server/.env.example server/.env
npm run db:migrate -w server   # apply server/src/db/migrations to DATABASE_URL
npm run dev                    # server on :3000, client on :5173
```

## Data layer

Postgres schema is managed with [Drizzle ORM](https://orm.drizzle.team) and
`drizzle-kit` — see [ADR-0001](docs/adr/0001-orm-selection.md) for why.

Schema lives in [`server/src/db/schema.ts`](server/src/db/schema.ts). After
changing it, run `npm run db:generate -w server` to produce a new SQL
migration under `server/src/db/migrations/`, then `npm run db:migrate -w server`
to apply it.

## Layout

- `shared/` — Zod schemas and types used by both `client` and `server`.
- `server/` — Fastify app. Each feature capability is one plugin under
  `server/src/modules/<capability>/` (routes → service → repository), mounted
  from `server/src/index.ts`.
- `client/` — Vite + React app.
