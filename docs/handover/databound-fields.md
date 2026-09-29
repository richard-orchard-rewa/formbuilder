# Handover: data-bound fields (as of 2026-09-29)

Where the data-bound fields work got to, so it can be picked up later. The design and reasoning are in [the proposal](../proposals/databound-fields.md); this document is the "where are we, and how do I get going again" view.

## In one paragraph

A data-bound field is a form control that reads from, and can save back to, a record in another system (ICIS today). form-builder never talks to ICIS: everything goes through a separate **Data Binding Service** (DBS, `binding-service/`) that owns a self-describing dictionary of bindable fields and all ICIS access. There are three pieces:
- **Runtime:** forms render bound fields, pre-fill them for a chosen client, and save changes back with per-field outcomes, including conflicts.
- **Binding creator:** a data steward creates new bound fields on allow-listed ICIS attributes, with no developer. Limits come from ICIS's own metadata and the service's own ICIS privileges.
- **Mock ICIS** (`mock-icis/`): runs the whole thing on made-up data for demos.

All of it is a prototype on one branch, not yet merged.

## Branch and PR status

- **Branch:** `claude/databound-field-design-e44228` (worktree `.claude/worktrees/issue-21-37f6d0`), cut from `main`.
- **PR status:** [richard-orchard-rewa/formbuilder#81](https://github.com/richard-orchard-rewa/formbuilder/pull/81) **merged** the prototype up to the handover commit (`6950adc`), and [richard-orchard-rewa/formbuilder#82](https://github.com/richard-orchard-rewa/formbuilder/pull/82) **merged** everything up to the user stories (`afa372e`). The sessions and participants work after that is in a third PR from the same branch; its description is [`pr-body.md`](pr-body.md).
- **Commits, oldest first:**

  | Commit | What |
  |---|---|
  | `7b761f2` | DBS + bound fields: Title / First / Last name, read-only Client number, against test ICIS |
  | `861a66d` | Binding creator (strategies, allow-list, privilege ceiling), plus the proposal's "Creating bindings without a developer" section |
  | `94df491` | Setup guide for a dedicated read-only ICIS account |
  | `54c8ffd` | Mock ICIS, demo mode, contract test, and the demo walkthrough |
  | `eb6969b` | Creator keeps limits current (re-checks on tab focus), and Save and publish |
  | `6950adc` | This handover, and the PR description |
  | `8a660bc` | Self-describing descriptors (presentations, options link, validation rules, operations); options validated at commit; Dropdown/Radio per form |
  | `aa2492b` | DBS-issued client anchor IDs and logical option codes; nothing in form-builder holds a Dataverse ID |
  | `991d359` | Identity registry moved into the DBS's own Postgres database |
  | `3a83798` | Configured bindings moved into that database too, with immutable published versions; docs and handover brought up to date |
| `afa372e`, `3a2f393` | User stories with acceptance criteria, and the contracts, API and schemas written out inline |
| `dae7e50` | Design: data-bound content for sessions, cases and participants (proposal section, epic US-14) |
| `8512409` | DBS and mock ICIS: session and participant anchors, `GET /anchors/sessions`, the `choice` strategy |
| *(latest)* | form-builder: module scope, sections, per-participant copies, per-anchor commits, read-back by participant; docs |

- **Checks at the latest commit:**
  - Typecheck clean in all six workspaces.
  - 152 unit tests pass: shared 12, server 27, binding-service 80, mock-icis 8, client 25. That includes 14 Postgres tests for the DBS's database; they need `BINDING_TEST_DATABASE_URL`, and CI's e2e job runs them.
  - The 7 Playwright e2e tests pass locally.
  - The joint-session walkthrough (demo step 7) was run end to end against the mock ICIS.
  - `npm audit --omit=dev` is clean.
  - CI (including the Playwright e2e suite and the DBS database tests) runs on #82.

## User stories

To hand this to a developer, see [databound-fields-user-stories.md](../proposals/databound-fields-user-stories.md). It has an appendix with every contract, the API (OpenAPI 3.1), the store adapter interface and the database schemas, written out in full. It also has epics US-9 to US-13 with acceptance criteria, the non-negotiables, a definition of done, "Later" stories, and a suggested order.

## What exists

| Area | Where | Notes |
|---|---|---|
| Design | [`docs/proposals/databound-fields.md`](../proposals/databound-fields.md) | Why an API; the contract; the strategies vs configuration model; guardrails; what Phases 0 and 0.5 built and found |
| Demo script | [`docs/demo/databound-fields-demo.md`](../demo/databound-fields-demo.md) | ~20 min, by role: developer, ICIS admin, data steward, form admin, practitioner |
| ICIS account setup | [`docs/setup/icis-binding-service-account.md`](../setup/icis-binding-service-account.md) | Entra app registration + Dataverse application user with a read-only role |
| DBS | `binding-service/` | `dictionary.ts` (built-in bindings), `allow-list.ts`, `creator.ts`, `service.ts`, `registry.ts` (configured bindings), `identity.ts` (anchor IDs, option codes), `descriptors.ts`, `validators.ts`, `db/` (its own Postgres: schema, migrations), `adapters/icis.ts` (the only ICIS-aware code), `adapters/fake.ts` |
| Contracts | `shared/src/schemas/binding.ts`; `bound` field in `shared/src/schemas/field.ts` | Bound fields render through the normal `toJsonSchema` → JSON Forms path |
| form-builder server | `server/src/modules/bindings/`; `session-templates/services/session-bound-fields.ts` | Relays the DBS to the browser; commits bound values after a submission is saved (`submission_bindings`, migration `0011`), and per anchor for session notes (`session_template_submission_bindings`, `0012`) |
| form-builder client | `FieldPalette`, `FieldInspector`, `FormFill` (client picker), `BindingResultsSummary`, `ModuleBuilder` (scope), `SessionTemplateFill` (session picker, per-participant copies), `SessionTemplateSubmissionView`, `DataBindings.tsx` (creator page), `schema/useBindingOptions.ts` | |
| Mock ICIS | `mock-icis/` | Dataverse Web API subset + Clients / Sessions / Service account / API log screens; `contract.test.ts` runs the DBS's real adapter against it |

## Running it again

You'll need Docker Desktop running.

```bash
docker compose up -d
npm run db:migrate -w server
npm run demo      # mock ICIS :3200, DBS :3100 (pointed at the mock), server :3000, client :5173
# or
npm run dev       # the same, but the DBS uses binding-service/.env (ADAPTER=fake or icis)
```

- **`binding-service/.env`** is gitignored, so it isn't in the repo.
  - It currently holds `ADAPTER=icis` plus the **test-ICIS credentials copied from `feedback`** (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `DYNAMICS_URL`). That borrowing was agreed as a stopgap.
  - For no ICIS at all, use `ADAPTER=fake`; `.env.sample` shows the shape.
- **`binding-service/.env.demo`** is committed and holds no secrets. It's what `npm run demo` uses.
- **Where the DBS's own data lives** (bindings stewards create, client anchor IDs, option codes): its **own Postgres database**, never form-builder's.
  - The databases are `binding_service` (real ICIS) and `binding_service_demo` (demo), on the local Postgres from `docker compose`.
  - `npm run db:migrate -w binding-service` creates and migrates `binding_service`; `npm run demo` does the same for the demo database.
  - `npm run demo:reset` empties the demo database only.
  - The old JSON files were imported and renamed `binding-service/data/*.json.imported`.
  - With `ADAPTER=fake` and no `DATABASE_URL`, everything is in memory.
  - The mock's own data resets with its **Reset demo** button, or on restart.
- **Test ICIS contact used throughout:** Bob McGee, client number `00152076`. He's also in the mock, alongside 19 made-up clients `00152077`–`00152095`.

## Decisions made (and by whom)

- **Everything through an API.** form-builder never calls ICIS; the DBS is a separate deployable, and a workspace here only for convenience. *(Richard, from the start.)*
- **The prototype may borrow `feedback`'s test-ICIS credentials** until the DBS has its own account. *(Richard.)* Never extend this to shared code, data or databases.
- **Stewards create bindings without a developer, by configuring developer-written strategies** (`attribute`, `lookup` so far) on an allow-list of attributes. *(Agreed after discussion; see the proposal.)*
- **Commits happen on submit only, not on draft save, and synchronously.** This is a prototype simplification; an outbox with retries is needed before real use.
- **Read-only referenced values are pinned; writable ones report conflicts** instead of overwriting. The proposal's decision 1 is only partly built: the "changed in ICIS since" indicator when re-viewing a submission isn't done.

## What we found in test ICIS

- **Title is a lookup,** `contact.csg_salutationid` → `csg_salutation`, not free text. The client number is `contact.csg_clientid`. Contact 00152076 (Bob McGee) is `2c616f0e-d741-f011-8779-000d3ad0ea14`.
- **The borrowed account can read contacts but not write them.** It lacks `prvWriteContact`, so every real write is refused, and every binding is display-only against real ICIS.
- **It can't read any of the reference tables behind contact's custom lookups** (salutation, gender, language, country, …). Title falls back to five known values, and no new lookup binding can be published.
- **`contact`'s updatable attributes include portal password hashes, the DSS/DEX client ID and government card numbers.** That's why the allow-list exists.

## Latest: sessions and participants (2026-09-29)

Session notes can now hold data for several people in one session, and each person's data stays theirs.
- **Anchors:** `session` (ICIS `wp_session`) and `participant` (`csg_attendance`: one person at one session), alongside `client`. All get DBS-issued IDs, checked against their type.
- **Module scope:** a module is filled in *once per session* or *once per participant*, chosen in the module builder. The palette offers only the bindings the scope can reach; the server refuses anything else.
- **Filling in:** pick a client's session, and each once-per-participant module renders one copy per person. Each copy pre-fills from that person's own attendance record and client record.
- **Storage:** participant values live under `data.participants[<participant anchor id>]`. On submit the server commits once per anchor (session; each attendance record; each participant's client) and records each attempt in `session_template_submission_bindings` (migration `0012`).
- **Reading back:** the submission view reads each copy from under its anchor and heads it with who that anchor is now (`GET /anchors/participants/:id`).
- **New strategy:** `choice`, for Dataverse option sets (attendance status). Values cross the API as codes (`attended`, `dna`), never integers.
- **Mock ICIS** gains sessions (a joint mediation session with Aisha Rahimi and Tariq Haddad, a group, individual ones) and a Sessions screen.
- Design and stories: the proposal's "Anchors beyond the client", and epic US-14. Cases, case participants, related-record paths and the disclosure boundary are designed, not built.

## Earlier: self-describing descriptors

Descriptors now say how to show, list, check, read and write each value:
- `presentations`: dropdown and/or radio for lookups; the form admin picks **Show as** per form.
- `options.href`.
- `validation`: a typed rule list, enforced by the DBS at commit, including that a lookup value is one of the live options.
- `operations`.

The steward can narrow the presentations in the binding creator. See the proposal: "The descriptor as built", "Adding validation rules", and "Beyond Dataverse".

**The DBS keeps all its data in its own database.** Configured bindings, client anchor IDs and option codes are all in Postgres (`binding-service/src/db/`), never form-builder's; see "Where the DBS keeps its data" in the proposal. Published binding versions are immutable at the database level.

**Identities now belong to the DBS.**
- Clients are anchored by DBS-issued IDs, and lookup values are logical codes (`mr`, `not-stated`), each mapped to per-store IDs by `binding-service/src/identity.ts`.
- form-builder stores no Dataverse IDs at all.
- The registry is the DBS's own Postgres database (`binding-service/src/db/`), never form-builder's. The DBS won't start against a real store without `DATABASE_URL`, because the data is as durable as the submissions that reference it.

## Next steps, in rough order

1. **Get the sessions and participants PR reviewed and merged** once CI is green.
2. **Get the DBS its own ICIS account**, per the [setup guide](../setup/icis-binding-service-account.md). Start read-only; add Write, Append and Append To to see real writes land in test ICIS. Then update `binding-service/.env`, the note in `CLAUDE.md`, and the proposal's findings.
3. **Decide the open US-14 questions:** which attendance statuses make someone a participant, how a participant copy is marked "not completed", and the §16 disclosure boundary for joint sessions. Then cases (US-14.12–14.13).
4. **Remember the client when a draft is resumed.** Today a resumed draft forgets which client it was for.
5. **An outbox for commits** (a queue with retries, like `feedback`'s ICIS sync), so an ICIS or DBS outage never blocks finalising.
6. **Show when a list's options fail to load.** Today the field renders with no control and no message (e.g. if the DBS is briefly unreachable).
7. **The next strategies:** `set-membership` (presenting needs) and `child-collection` (referrals, per participant).
8. **Validation-rule types** (phone, email, Medicare, …) that bindings reference and that's enforced in both the form and the DBS.
9. **Identity:** Entra sign-in for form-builder, then on-behalf-of tokens to the DBS. §8 of the requirements rules out a service account for real clinical writes.
10. **Steward permissions** on the Data bindings page, which is currently open to anyone.

## Gotchas hit along the way

- **Shell `cd` fails in this environment.** The shell's Node version manager (fnm) hook errors on `cd`, so `cd x && …` never runs. Run tools from the repo root with paths, e.g. `node node_modules/typescript/bin/tsc -p server`.
- **Docker port clashes.** Other projects' Postgres containers also bind 5432. If this worktree's container starts without its port, stop the other container and run `docker compose up -d --force-recreate`.
- **`drizzle-kit migrate` can fail silently** (a spinner, then exit 1). If migrations don't apply, check that the database is actually reachable on 5432.
- **"New form" uses `window.prompt`,** which automated browsers can't answer. Create forms via `POST /api/forms` when scripting.
- **Neither the DBS nor the server runs in watch mode;** restart them after code changes. The client (Vite) hot-reloads.
