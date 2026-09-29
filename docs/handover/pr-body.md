## Summary

Follow-up to richard-orchard-rewa/formbuilder#81, which merged the data-bound fields prototype up to its handover (`6950adc`). This PR carries the work done after that:
- making binding descriptors self-describing
- validating lookup values at commit
- presenting lookups as radio buttons
- the Data Binding Service (DBS) owning the identities forms see
- the DBS keeping all its data in its own database
- user stories for a developer, with every contract written out
- sessions and participants: one session note for several people, each person's part saved to and read back from their own records

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

### User stories (`afa372e`, `3a2f393`)
- `docs/proposals/databound-fields-user-stories.md`: epics US-9 to US-14 with acceptance criteria, plus an appendix with every data contract, the DBS's API (OpenAPI 3.1), the relay API, the store adapter interface, both database schemas (SQL), the built-in bindings and allow-list, the mock subset and the user-facing messages.

### Sessions and participants (`dae7e50`, `8512409`, and the latest commit)
- **Design first** (`dae7e50`): the proposal's "Anchors beyond the client" and epic US-14. It covers sessions, cases, session and case participants, module scope, per-participant storage, and the open decisions (eligibility, completeness, the §16 disclosure boundary).
- **New anchors:** `session` (ICIS `wp_session`) and `participant` (`csg_attendance`: one person at one session), with DBS-issued IDs checked against their type. `GET /anchors/sessions?clientNumber=` lists a client's sessions with everyone in them. `GET /anchors/participants/:id` says who a participant anchor is.
- **A `choice` strategy** for Dataverse option sets (attendance status), presented through codes like lookups. Built-in bindings: `session.subject`, `session.start`, `session.end` (read-only), and `participant.attendance` (writable).
- **Bindings must match the request's anchor:** a mismatched resolve or commit is refused (400).
- **Module scope:** a module is filled in once per session or once per participant. The builder's palette offers only the bindings the scope can reach, and the server refuses others (422).
- **Session templates keep modules as sections.** Filling one in: pick a client's session, and each once-per-participant module renders one copy per person, pre-filled from that person's own records.
- **Each person's data stays theirs.**
  - It's stored under `data.participants[<participant anchor id>]`.
  - It's committed once per anchor: the session, each attendance record, each participant's client. Each commit is recorded in the new `session_template_submission_bindings` table (server migration `0012`).
  - The submission view reads each copy back and labels it with who that anchor is now.
- **Mock ICIS** gains sessions and attendance records (a joint mediation session, a group, individual sessions), a Sessions screen and option-set metadata. Its OData support is now generic across record entities.

### Docs
- The proposal gains "The descriptor as built", "Adding validation rules" (named library patterns rather than steward-authored regex, per §3; hard vs advisory rules), "Beyond Dataverse" and "Where the DBS keeps its data".
- The handover, `CLAUDE.md`, `README.md` and the demo script are updated.

## Worth reviewing closely

- **The two migrations for the DBS database**, especially `0002_published_binding_versions_are_immutable.sql` (the trigger).
- **The `.github/workflows/ci.yml` change.** CI's e2e job, which has Postgres, now also migrates a DBS test database and runs the 13 Postgres tests. The unit-test job has no database, so they're skipped there.
- **The boundary translation in `binding-service/src/service.ts`.** Anchor IDs and codes go in and out; store IDs never cross it. It now reads the anchor type from the request, and checks it against both the bindings and the ID's own type.
- **`server/src/modules/session-templates/services/session-bound-fields.ts`**: the per-anchor commits. One participant's failure mustn't touch another's write.
- **Server migration `0012`** (`session_template_submission_bindings`).

## Setup after pulling

```bash
npm install
npm run db:migrate -w server            # adds session_template_submission_bindings
npm run db:migrate -w binding-service   # creates the DBS's own database
```

`npm run demo` does the demo database's migration itself.

## Test plan

- [x] `npm run typecheck`: all six workspaces
- [x] Unit tests: 152 across the workspaces, including 14 Postgres tests with `BINDING_TEST_DATABASE_URL` set (CI's e2e job runs these). New tests cover each participant's attendance being written to, and read back for, that person only, in the fake store and through the real ICIS adapter against the mock.
- [x] Playwright e2e suite: 7 tests, locally
- [x] `npm audit --omit=dev`: 0 vulnerabilities
- [x] Manual, against the mock:
  - Title as radio buttons, pre-filled and saved back
  - a Title that isn't in ICIS's list refused before anything is sent
  - form-builder storing only DBS anchor IDs and option codes
  - identities and bindings served from the DBS database
  - the old JSON bindings imported
  - a second binding on the same attribute refused
  - the joint-session walkthrough (demo step 7): Aisha and Tariq each get a copy, Tariq's attendance saved as DNA while Aisha's stays Attended, and the saved note read back with each copy under the right person
  - a client binding in a once-per-session module refused
- [ ] Playwright e2e suite and the DBS database tests: CI

🤖 Generated with [Claude Code](https://claude.com/claude-code)
