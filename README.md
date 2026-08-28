# formbuilder

## Data layer

Postgres schema is managed with [Drizzle ORM](https://orm.drizzle.team) and
`drizzle-kit` — see [ADR-0001](docs/adr/0001-orm-selection.md) for why.

```bash
npm install
docker compose up -d          # local Postgres on :5432
cp .env.example .env
npm run db:migrate            # apply migrations/ to DATABASE_URL
```

Schema lives in [`src/db/schema.ts`](src/db/schema.ts). After changing it,
run `npm run db:generate` to produce a new SQL migration under
`src/db/migrations/`, then `npm run db:migrate` to apply it.
