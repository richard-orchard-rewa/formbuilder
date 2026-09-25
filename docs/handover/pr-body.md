## Summary

Follow-up to richard-orchard-rewa/formbuilder#81, which merged the data-bound fields prototype up to its handover (`6950adc`). This PR carries the work done after that:
- making binding descriptors self-describing
- validating lookup values at commit
- presenting lookups as radio buttons
- the Data Binding Service (DBS) owning the identities forms see
- the DBS keeping all its data in its own database

Design: `docs/proposals/databound-fields.md`. Status and next steps: `docs/handover/databound-fields.md`.

### Self-describing descriptors, validation, radio buttons (`8a660bc`)
- **Descriptors now say how to handle each value.** Each gives how it may be shown (`presentations`: text box, dropdown, radio buttons), where its options come from (`options.href`), its `validation` (a typed rule list plus the store's own required flag), and links to its resolve/commit `operations`. The DBS fills these in centrally for built-in and configured bindings. They're optional in the schema, so forms snapshotted earlier still load.
- **The DBS runs every rule at commit**, through one checks table (`validators.ts`): `maxLength`, and `oneOfOptions`. `oneOfOptions` means a lookup value must be one of the store's current options; before, a caller could bypass that. A value the store requires can't be cleared. form-builder mirrors the same rules in the rendered form.
- **Form admins choose Dropdown or Radio buttons** per form (**Show as** in the inspector), from what the binding allows. Stewards can narrow that in the binding creator. *Required* is forced on where ICIS requires a value.

### DBS-owned identities (`aa2492b`)
- **Clients are anchored by DBS-issued IDs**, mapped to each store's record (`{ refs: { icis: <contact guid> } }`). resolve and commit refuse a store's own record ID.
- **Lookup values are logical codes** (`mr`, `not-stated`), derived from the label on first sight and kept thereafter, and mapped to each store's row IDs.
- **Nothing in form-builder holds a Dataverse ID any more**, so moving client data off ICIS later won't strand stored submissions. Stores are named (`RecordStore.name`), which keys those references.

### The DBS's own database (`991d359`, `3a83798`)
- **Identities and configured bindings are in the DBS's own Postgres database** (`binding_service` / `binding_service_demo`), never form-builder's. The schema and migrations are in `binding-service/src/db/`. `npm run db:migrate -w binding-service` creates the database if needed, then migrates.
- **Race-safe identity issuing:** a transaction-scoped advisory lock, backed by unique indexes, so concurrent requests (and DBS instances) agree on one ID or code.
- **Published binding versions are immutable**, enforced by a database trigger (no update or delete, even from hand-run SQL). There's at most one draft per binding, a key's attribute is fixed, and an attribute has one binding.
- **The DBS refuses to start against a real store without its database.** Only `ADAPTER=fake` runs in memory.
- **Bindings from the old JSON file** are imported by `db:migrate` once, and the file is renamed `.imported`.
- `npm run demo` migrates the demo database, and `npm run demo:reset` empties it; the reset refuses anything not `*_demo` or `*_test`.

### Docs
- The proposal gains "The descriptor as built", "Adding validation rules" (named library patterns rather than steward-authored regex, per §3; hard vs advisory rules), "Beyond Dataverse" and "Where the DBS keeps its data".
- The handover, `CLAUDE.md`, `README.md` and the demo script are updated.

## Worth reviewing closely

- **The two migrations for the DBS database**, especially `0002_published_binding_versions_are_immutable.sql` (the trigger).
- **The `.github/workflows/ci.yml` change.** CI's e2e job, which has Postgres, now also migrates a DBS test database and runs the 13 Postgres tests. The unit-test job has no database, so they're skipped there.
- **The boundary translation in `binding-service/src/service.ts`.** Anchor IDs and codes go in and out; store IDs never cross it.

## Setup after pulling

```bash
npm install
npm run db:migrate -w binding-service   # creates the DBS's own database
```

`npm run demo` does the demo database's migration itself.

## Test plan

- [x] `npm run typecheck`: all six workspaces
- [x] `npm test`: 136 tests, including 13 Postgres tests with `BINDING_TEST_DATABASE_URL` set (CI's e2e job runs these)
- [x] `npm audit --omit=dev`: 0 vulnerabilities
- [x] Manual, against the mock:
  - Title as radio buttons, pre-filled and saved back
  - a Title that isn't in ICIS's list refused before anything is sent
  - form-builder storing only DBS anchor IDs and option codes
  - identities and bindings served from the DBS database
  - the old JSON bindings imported
  - a second binding on the same attribute refused
- [ ] Playwright e2e suite and the DBS database tests: CI

🤖 Generated with [Claude Code](https://claude.com/claude-code)
