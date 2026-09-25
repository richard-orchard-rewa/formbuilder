## Summary

Prototypes **data-bound fields**: form controls that read from, and can save back to, a client's ICIS record, via a separate **Data Binding Service** (DBS). form-builder never talks to ICIS directly. Design: `docs/proposals/databound-fields.md`. Status and next steps: `docs/handover/databound-fields.md`.

- **`binding-service/`**, a new workspace. It's a self-describing API that owns the dictionary of bindable fields and all ICIS access.
  - **Runtime API:** resolve values for a client, and commit changes back. Commits write only what changed, report conflicts instead of overwriting, and re-check limits at the boundary.
  - **Binding creator:** data stewards create bindings on an allow-list of ICIS attributes, with no developer involved. Type and length come from ICIS metadata. The service's own ICIS privileges cap what a binding can offer, and are re-checked when a binding is published.
  - **ICIS adapter:** plain fetch + MSAL against the Dataverse Web API, the only code that knows ICIS column names or OData. A fake store sits alongside it.
- **form-builder:**
  - A `bound` field type that snapshots its descriptor into the form version, and a *Data bound* section in the palette.
  - On fill, a client picker pre-fills bound values; after submit, the page shows a per-field outcome.
  - A **Data bindings** page for stewards.
  - The server relays the DBS to the browser and records each commit in a new `submission_bindings` table (migration `0011`).
- **`mock-icis/`**, a new workspace. It emulates the Dataverse Web API subset the adapter uses, with 20 made-up clients, and has screens for ICIS staff, the ICIS admin and an API log.
  - `npm run demo` runs everything against it.
  - A contract test runs the DBS's real adapter against it.
- **Docs:**
  - A demo walkthrough by role (`docs/demo/`).
  - A setup guide for a dedicated read-only ICIS account (`docs/setup/`).
  - `CLAUDE.md` and `README.md` updated.

## Worth reviewing closely

- **Credentials:** against real test ICIS, the DBS currently uses `feedback`'s test app registration, borrowed by agreement as a stopgap. It lives only in the gitignored `binding-service/.env`. That identity can't write contacts, so real-ICIS writes come back as clean per-field "Not saved" results.
- **The allow-list** (`binding-service/src/allow-list.ts`) is the security boundary for the binding creator.
- **The DBS demo mode** accepts a static token, and refuses it for any non-localhost URL.

## Test plan

- [x] `npm run typecheck`: all six workspaces
- [x] `npm test`: 94 tests (shared 10, server 22, binding-service 38, mock-icis 6, client 19)
- [x] `npm audit --omit=dev`: 0 vulnerabilities
- [x] Manual, against test ICIS: prefill for client 00152076; the write is refused cleanly (missing `prvWriteContact`); binding creator live metadata and privilege checks
- [x] Manual, against the mock: create, publish and use bindings; write-back; conflict with a staff edit; privilege ceiling
- [ ] Playwright e2e suite (not run locally; CI will run it)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
