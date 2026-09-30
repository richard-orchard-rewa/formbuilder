## Summary

Follow-up to richard-orchard-rewa/formbuilder#82, which merged the data-bound fields work up to the user stories (`afa372e`). This PR adds:
- the stories' contracts, API and schemas written out inline;
- a design for data-bound content at the session, case and participant levels;
- a prototype of the session and participant part: one session note for several people, with each person's part saved to, and read back from, their own records.

Design: `docs/proposals/databound-fields.md`, "Anchors beyond the client". Stories: epic US-14 in `docs/proposals/databound-fields-user-stories.md`. Status and next steps: `docs/handover/databound-fields.md`.

### Contracts inline (`3a2f393`)
- The user stories' appendix now holds every contract in full:
  - the data contracts;
  - the DBS's API (OpenAPI 3.1) and form-builder's relay;
  - the store adapter interface and the Dataverse calls behind it;
  - both database schemas (SQL);
  - the built-in bindings and allow-list;
  - the mock ICIS subset;
  - the user-facing messages.
- Each story links the sections it needs.

### Design: sessions, cases and participants (`dae7e50`)
- **Anchor types.** Beyond the client: sessions, cases, session participants (one person at one session) and case participants.
- **Module scope.** A module is filled in once per case, once per session, or once per participant.
- **Storage.** Values are stored per participant.
- **A new strategy:** `choice`, for Dataverse option sets.
- **Related-record paths** (design only).
- **The open decisions:** eligibility, completeness, and the §16 disclosure boundary.
- **Stories.** Epic US-14 has the slice (14.1–14.11) and the designed-only stories (14.12–14.16).

### Prototype: sessions and participants (`8512409`, `d0dab50`)
- **New anchors.** `session` (ICIS `wp_session`) and `participant` (`csg_attendance`), with DBS-issued IDs checked against their type.
- **New endpoints.**
  - `GET /anchors/sessions?clientNumber=` lists a client's sessions, with everyone in them.
  - `GET /anchors/participants/:id` says who a participant anchor is.
- **A `choice` strategy** for option sets (attendance status), presented through codes like lookups.
- **New built-in bindings.**
  - `session.subject`, `session.start` and `session.end`, read-only.
  - `participant.attendance`, writable.
- **Bindings must match the request's anchor.** A mismatched resolve or commit is refused (400).
- **Module scope.** A module is filled in once per session or once per participant. The palette offers only the bindings that scope can reach, and the server refuses others (422).
- **Session templates keep modules as sections.** To fill one in, pick a client's session. Each once-per-participant module then renders one copy per person, pre-filled from that person's own attendance and client records.
- **Each person's data stays theirs.**
  - It's stored under `data.participants[<participant anchor id>]`.
  - It's committed once per anchor: the session, each attendance record, and each participant's client. Every attempt is recorded in `session_template_submission_bindings` (server migration `0012`).
  - The submission view reads each copy back and heads it with who that anchor is now.
- **Mock ICIS additions.**
  - Sessions and attendance records: a joint mediation session, a group, and individual sessions.
  - A Sessions screen, and option-set metadata.
  - OData support that works generically across record entities.

### Docs
- **User stories.** The appendix covers the new endpoints, adapter calls, table and mock subset. US-14 gains acceptance criteria for the participant lookup, the scope refusal and read-back.
- **The proposal.** Its prototype slice is marked as built.
- **The handover.**
- **The demo script.** New step 7 is a joint session: one note, two people.
- **`CLAUDE.md`.**

## Worth reviewing closely

- **`binding-service/src/service.ts`.**
  - It reads the anchor type from the request.
  - It refuses bindings on another anchor type.
  - It only maps an anchor ID issued for that type (`identity.ts`).
- **`server/src/modules/session-templates/services/session-bound-fields.ts`.** This is the per-anchor commit. One participant's failure mustn't touch another's write.
- **Server migration `0012`.**
- **Simplification: bindings in once-per-participant modules.** They can use `participant` and `client` bindings only. The design also allows derived `session` bindings there.

## Setup after pulling

```bash
npm install
npm run db:migrate -w server   # adds session_template_submission_bindings
```

## Test plan

- [x] `npm run typecheck`: all six workspaces
- [x] Unit tests: 152 across the workspaces
  - This includes 14 Postgres tests, run with `BINDING_TEST_DATABASE_URL` set. CI's e2e job runs these.
  - New tests check that each participant's attendance is written to, and read back for, that person only. They run in the fake store, and through the real ICIS adapter against the mock.
- [x] Playwright e2e suite: 7 tests, locally
- [x] `npm audit --omit=dev`: 0 vulnerabilities
- [x] Manual, against the mock (demo step 7):
  - Aisha and Tariq each get a copy.
  - Tariq's attendance is saved as DNA while Aisha's stays Attended.
  - The saved note reads back with each copy under the right person.
  - A client binding in a once-per-session module is refused.
- [ ] CI

🤖 Generated with [Claude Code](https://claude.com/claude-code)
