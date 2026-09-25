## Summary

Prototypes **data-bound fields**: form controls that read from, and can save back to, a client's ICIS record. They work through a separate **Data Binding Service** (DBS); form-builder never talks to ICIS directly.
- Design: `docs/proposals/databound-fields.md`
- Where it got to and what's next: `docs/handover/databound-fields.md`
- Demo walkthrough: `docs/demo/databound-fields-demo.md`

### The Data Binding Service (`binding-service/`, new workspace)
- **Runtime API:** resolve a client's bound values, and commit changes back. Commits write only what changed, in one conditional update. They report conflicts instead of overwriting, and check every value against its binding's rules at the boundary, including that a lookup value is one of the store's current options.
- **Self-describing descriptors:** each binding says how it may be shown (text box, dropdown, radio buttons), where its options come from, its validation rules and store-required flag, and links to the resolve/commit operations.
- **Binding creator (`/admin`):** data stewards create bindings on an allow-list of ICIS attributes, with no developer involved. Type and length come from ICIS metadata, and a request can only narrow them. The service's own ICIS privileges cap what a binding can offer, re-checked at publish. Published versions are immutable.
- **DBS-owned identities:** clients are anchored by DBS-issued IDs, and lookup values are logical codes (`mr`, `not-stated`). Both are mapped to each store's IDs, so nothing in form-builder holds a Dataverse ID, and moving data off ICIS later doesn't strand stored submissions.
- **Its own Postgres database** (`binding_service`, never form-builder's) holds identities and configured bindings. Unique indexes and advisory locks make issuing IDs race-safe, and a trigger makes published binding versions immutable. The service refuses to start against a real store without it.
- **ICIS adapter:** plain fetch + MSAL against the Dataverse Web API, the only code that knows ICIS column names or OData. A fake in-memory store sits alongside it.

### form-builder
- **Builder:** a `bound` field type that snapshots its descriptor, a *Data bound* palette section, and inspector details, including **Show as** (Dropdown / Radio buttons).
- **Fill page:** a client picker that pre-fills bound values; after submit, a per-field outcome (saved / unchanged / conflict / refused).
- **Data bindings page:** where stewards create bindings.
- **Server:** relays the DBS to the browser and records each commit in a new `submission_bindings` table (migration `0011`).

### `mock-icis/` (new workspace)
A Dataverse Web API look-alike covering the subset the adapter uses, with 20 made-up clients.
- Its screens let a demo play ICIS staff, the ICIS admin (granting the service's privileges live) and an observer (the API log).
- `npm run demo` runs everything against it.
- A contract test runs the DBS's real adapter against it.

### Docs
The proposal, the handover, the demo walkthrough, a setup guide for a dedicated read-only ICIS account (`docs/setup/`), and `CLAUDE.md` / `README.md`.

## Worth reviewing closely

- **Credentials:** against real test ICIS, the DBS currently uses `feedback`'s test app registration, borrowed by agreement as a stopgap. It lives only in the gitignored `binding-service/.env`. That identity can't write contacts, so real-ICIS writes come back as clean per-field "Not saved" results.
- **The allow-list** (`binding-service/src/allow-list.ts`) is the security boundary for the binding creator.
- **Demo mode** accepts a static token, and refuses it for any non-localhost URL.
- **The DBS database's durability:** losing it would orphan stored client anchors and codes. See "Where the DBS keeps its data" in the proposal.

## Setup

```bash
docker compose up -d
npm run db:migrate -w server
npm run db:migrate -w binding-service   # the DBS's own database
npm run demo                            # or `npm run dev` against binding-service/.env
```

## Test plan

- [x] `npm run typecheck`: all six workspaces
- [x] `npm test`: 136 tests, including 13 Postgres tests with `BINDING_TEST_DATABASE_URL` set (CI's e2e job runs these)
- [x] `npm audit --omit=dev`: 0 vulnerabilities
- [x] Manual, against test ICIS: prefill for client 00152076; the write is refused cleanly (missing `prvWriteContact`); binding creator live metadata and privilege checks
- [x] Manual, against the mock:
  - create, publish and use bindings
  - Title as radio buttons
  - write-back, and a conflict with a staff edit
  - the privilege ceiling
  - form-builder storing only DBS anchor IDs and option codes
- [ ] Playwright e2e suite: CI

🤖 Generated with [Claude Code](https://claude.com/claude-code)
