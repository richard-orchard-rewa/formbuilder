# User stories: Data-bound fields and the Data Binding Service

## Status

Candidate user stories, not yet GitHub issues. Written 2026-09-29 so the data-bound fields work can be handed to a developer and built properly, not just prototyped.

- **Design:** [databound-fields.md](databound-fields.md) (the why, the contract, the guardrails).
- **Reference implementation:** everything below has been prototyped in this repo, in PRs richard-orchard-rewa/formbuilder#81 (merged) and richard-orchard-rewa/formbuilder#82. Each story names the prototype files as *reference*. They show one working answer; they are not a spec to copy line for line.
- **Where it got to:** [handover](../handover/databound-fields.md).

Epics continue the repo's numbering (`US-0`–`US-8` are taken): **US-9** the Data Binding Service, **US-10** data-bound fields in form-builder, **US-11** the binding creator, **US-12** demo and test support, **US-13** environment and operations. The "Later" section lists follow-on stories not yet designed in detail.

To turn a story into an issue:
- Title: `US-<epic>.<n> <title>`.
- Body: the story, its notes and its acceptance criteria.
- Label: its epic.

## The idea in brief

A **data-bound field** is a form control whose value is read from, and can be saved back to, a record in another system: ICIS (Dynamics 365 / Dataverse) today, RAWA's own client system later. form-builder **never talks to ICIS directly**. Everything goes through a separate service, the **Data Binding Service (DBS)**, which:

- publishes a **self-describing dictionary** of the fields forms can bind to. Each entry says how to show, list, check, read and write its value.
- **reads and writes** values in the backing store, safely: only what changed, never over someone else's newer change, and checked against its rules.
- lets a **data steward** create new bindable fields from an approved list of attributes, without a developer.
- owns the **identities** forms hold (client IDs, option codes), so no form or submission stores an ICIS ID.

## Roles

| Role | Who | Does |
|---|---|---|
| **Practitioner** | Staff filling in a form about a client | Sees the client's current values, edits them, submits |
| **Form admin** | Builds forms and modules (e.g. Beth) | Adds data-bound fields to forms, chooses how they're shown |
| **Data steward** | Knows what an ICIS field means and who reports on it | Creates and publishes bindings on approved attributes |
| **Data owner** | Accountable for a data domain | Approves which attributes may ever be bound (the allow-list) |
| **ICIS administrator** | Administers the ICIS environment | Grants the DBS's own ICIS account its privileges |
| **DBS developer** | Maintains the DBS | Writes write-strategies, store adapters and the allow-list |

## Non-negotiables (apply to every story)

1. **No direct store access from form-builder.** form-builder's server and client reach the DBS over HTTP only. ICIS column names, OData, Dataverse IDs and Dataverse errors appear only inside the DBS's store adapter.
2. **Logical, store-agnostic contracts.** Bindings are named by logical keys (`client.preferredName`), never store names. Clients are identified by DBS-issued anchor IDs, and lookup values by logical option codes (`mr`, `not-stated`).
3. **The DBS has its own database**, never form-builder's. It holds the identities the DBS issues and the bindings stewards create, and is as durable as the submissions that reference them.
4. **Validation happens at the API boundary.** The DBS enforces every rule on commit, whatever the form did (requirements §3). The form mirrors the rules for user experience only.
5. **Published is immutable.** A published binding version never changes; editing creates a new version. Forms snapshot the version they were built with.
6. **The allow-list is the security boundary.** Only attributes a data owner approved can ever be bound. The DBS's own ICIS privileges are the ceiling on what any binding can offer.
7. **Nothing in the submission is lost to an outage.** The submission is recorded first, and bound values are sent on afterwards. A refused or failed write is reported per field; it never fails the submission.

## Definition of done (every story)

- Acceptance criteria met, with automated tests at the right level:
  - unit tests for rules;
  - contract tests for the store adapter;
  - component tests for UI;
  - Playwright for end-to-end flows where the story is user-facing.
- Typecheck clean, `npm test` green, `npm audit --omit=dev` clean, CI green.
- Docs updated where behaviour or setup changed: the proposal, `CLAUDE.md`, the demo walkthrough.
- No new dependency on the `feedback` repo or its credentials.

---

## Epic US-9: Data Binding Service

The standalone service that owns the dictionary, identities and all store access.

### US-9.1 Service skeleton and self-description

**As a** DBS developer, **I want** a standalone DBS service that describes itself, **so that** consumers can be wired to it without reading its code.

Notes: a separate deployable, today a workspace (`binding-service/`), built to be liftable into its own repo. Fastify, as in the rest of the repo. Reference: `binding-service/src/app.ts`, `server.ts`.

Acceptance criteria:
- [ ] `GET /` returns the service's name and purpose, its anchors, its strategies and every endpoint with a one-line description.
- [ ] `GET /health` returns 200 when the service is ready.
- [ ] Configuration comes from environment variables only: the store adapter, its connection details, `DATABASE_URL` and the port. A committed `.env.sample` documents every variable, with no secrets.
- [ ] The service binds to localhost by default and logs a startup line with its adapter and database name (no secrets).
- [ ] Nothing in `binding-service/` imports from form-builder's `server/` or `client/`.

### US-9.2 Store adapter contract, and an in-memory fake

**As a** DBS developer, **I want** one interface every backing store implements, **so that** ICIS can be replaced by another store without touching the rest of the DBS.

Notes: the contract covers the reads and writes the DBS needs, plus metadata and the account's own privileges. Every store has a **name** (`icis`, `fake`), which keys identity references. Reference: `binding-service/src/adapters/adapter.ts`, `adapters/fake.ts`.

Acceptance criteria:
- [ ] A `RecordStore` interface with these operations:
  - find a client by client number (unambiguous match only);
  - read a record's attributes with a row version;
  - conditionally write changed attributes against that row version;
  - list a lookup's options;
  - describe attributes (type, max length, required level, updatable, lookup target);
  - report the account's own privileges (read/write/append on the entity; read/append-to on lookup targets).
- [ ] Write failures are typed: a concurrent change (the row version doesn't match) versus a refusal (privilege or business rule), each with a message safe to show a user.
- [ ] An in-memory fake store seeded with representative clients passes the same behavioural tests as a real adapter, with adjustable privileges.
- [ ] The DBS runs end to end with the fake store and no external systems.

### US-9.3 Dataverse (ICIS) adapter

**As a** DBS developer, **I want** an adapter for ICIS's Dataverse Web API, **so that** the DBS can read and write real client records.

Notes: this is the only ICIS-aware code. Plain `fetch` against Web API v9.2 was enough for the prototype. The prototype used client-credentials auth; see US-L.2 for the identity model production needs. Reference: `binding-service/src/adapters/icis.ts`, and the findings in the proposal's "What the prototype found in test ICIS".

Acceptance criteria:
- [ ] Authenticates with MSAL. The token is cached and refreshed by MSAL; no secret is ever logged.
- [ ] Reads select only the needed columns; lookups are read as `_<attribute>_value`. The row's `@odata.etag` is returned as its version.
- [ ] Writes:
  - [ ] Text attributes and lookup binds (`<nav>@odata.bind`) go in **one PATCH with `If-Match`**. A 412 becomes a concurrent-change error.
  - [ ] Clearing a lookup disassociates it (`DELETE …/<nav>/$ref`).
  - [ ] Lookup navigation property and entity-set names are resolved from Dataverse metadata, not hard-coded.
- [ ] Metadata: attribute type, `MaxLength`, `RequiredLevel`, `IsValidForUpdate` and lookup `Targets` come from `EntityDefinitions`.
- [ ] Privileges: the account's own privileges come from `RetrieveUserPrivileges` (via `WhoAmI`). Entity privilege names come from `EntityDefinitions(…).Privileges`. They're cached briefly, with a configurable TTL.
- [ ] Errors:
  - [ ] Dataverse privilege errors are reported as the missing privilege's name, with principal and business-unit IDs stripped.
  - [ ] Every logical name interpolated into a URL is validated as a plain identifier.
  - [ ] Client numbers are validated as digits before being used in a filter.
- [ ] If the account can't read a lookup's reference table, the options come back as `unavailable`. Only the salutation list has a known-good fallback.
- [ ] A contract test runs the adapter against the mock ICIS (US-12.3).

### US-9.4 The DBS's own database

**As a** DBS developer, **I want** the DBS's durable data in its own database, **so that** identities and bindings survive restarts and are never mixed with form-builder's data.

Notes: Postgres + Drizzle, following ADR-0001. Reference: `binding-service/src/db/`.

Acceptance criteria:
- [ ] A separate database (`binding_service`; `binding_service_demo` for demos). form-builder's database is never used or touched.
- [ ] `npm run db:migrate -w binding-service` creates the database if missing, then applies migrations. It's idempotent.
- [ ] The DBS **refuses to start** against a real store without `DATABASE_URL`. Only the in-memory fake may run without a database.
- [ ] A reset script empties the tables of `*_demo` or `*_test` databases only, and refuses any other name.
- [ ] CI runs the database-backed tests against a real Postgres.

### US-9.5 DBS-issued client identities (anchors)

**As a** form admin and practitioner, **I want** forms to identify a client by a DBS-issued ID, **so that** stored submissions stay valid when client data moves out of ICIS.

Notes: an anchor ID maps to the client's record in each store (`{ refs: { icis: <contact guid> } }`). Reference: `binding-service/src/identity.ts` (`PostgresIdentityRegistry`), `db/schema.ts` (`anchors`, `anchor_refs`), and the proposal's "Beyond Dataverse".

Acceptance criteria:
- [ ] `GET /anchors/client?clientNumber=` returns `{ id, clientNumber, displayName }`, or 404 when there's no unambiguous match. `id` is a DBS-issued ID, never the store's record ID.
- [ ] The same store record always yields the same anchor ID, including under concurrent requests (a transaction-scoped lock plus a unique index on store and record).
- [ ] Resolve and commit accept only DBS anchor IDs. A store record ID is refused as unknown.
- [ ] A store record belongs to exactly one anchor. An anchor has at most one reference per store.

### US-9.6 Logical option codes

**As a** form admin, **I want** lookup values stored as logical codes, **so that** a submission's "Title: Ms" still means Ms after the list moves to another store or is relabelled.

Notes: codes are derived from the label the first time the DBS sees a row, then kept. Reference: `identity.ts` (`codesFor`, `storeIdForCode`), `db/schema.ts` (`option_codes`, `option_code_refs`).

Acceptance criteria:
- [ ] Options are served as `{ value: <code>, label }`, never with store row IDs.
- [ ] A new row's code is its label slugified (`Not Stated` → `not-stated`) and unique within its list (`-2`, `-3`, …).
- [ ] A row keeps its code when its label changes.
- [ ] Codes are assigned consistently under concurrent requests.
- [ ] On commit, a code is translated to the store's row ID. An unknown code, or a store row ID sent as a value, is refused.
- [ ] A value read from the store whose row isn't in the current list (e.g. deactivated) still gets a stable code.

### US-9.7 Binding dictionary and self-describing descriptors

**As a** form-builder developer, **I want** every binding described completely by its descriptor, **so that** form-builder can render, validate, read and write it without knowing DBS URL conventions.

Notes: built-in bindings are code; configured ones come from US-11. Reference: `binding-service/src/dictionary.ts`, `descriptors.ts` (`completeDescriptor`), `shared/src/schemas/binding.ts`.

Acceptance criteria:
- [ ] `GET /bindings?anchor=client` lists **published** bindings; `GET /bindings/:key` returns one; unknown keys return 404.
- [ ] Each descriptor contains:
  - `key`, `version`, `label`, `description`, `anchor`, `access` (`read` | `readWrite`), `control` (text with optional max length, or lookup) and `overridable` (`label`, `required`);
  - `presentations: { allowed, default }`: text → `text`; lookup → `dropdown` and/or `radio`;
  - `options: { href, allowBlank }` for lookups;
  - `validation: { required, rules[] }`, where `required` is what the **store** demands;
  - `operations: { resolve: { href }, commit: { href, strategy } }`.
- [ ] Descriptors never contain store names, table or column names, or store IDs.
- [ ] The built-in bindings are Title (lookup), First name, Last name, and Client number (read-only).
- [ ] New descriptor fields are backwards-compatible. Descriptors snapshotted into forms before a field existed still load and render as before.

### US-9.8 Resolve current values

**As a** practitioner, **I want** a form to open with the client's current values, **so that** I'm editing what ICIS holds, not retyping it.

Reference: `binding-service/src/service.ts` (`resolve`).

Acceptance criteria:
- [ ] `POST /resolve { anchor, bindings[] }` returns `{ values, resolvedAt }`, keyed by binding key: text as-is, lookups as codes, and `null` for no value.
- [ ] Unknown bindings return 404, naming them. An unknown anchor returns 404.
- [ ] One store read per request, whatever the number of bindings.

### US-9.9 Commit changed values safely

**As a** practitioner, **I want** my edits saved back to ICIS without overwriting anyone else's, **so that** a colleague's newer change is never silently lost.

Reference: `service.ts` (`commit`).

Acceptance criteria:
- [ ] `POST /commit { anchor, values, baseline? }` returns a per-binding result: `written`, `unchanged`, `conflict` (with the store's `current` value), `readOnly`, or `failed` (with a message).
- [ ] Only changed values are written. Blank text means "no value".
- [ ] If `baseline` is given and the store's value no longer matches it, the result is `conflict`, and that value isn't written.
- [ ] All changed values are written in **one conditional update**. A change landing between the read and the write fails the write rather than half-applying it.
- [ ] Read-only bindings are never written.
- [ ] Store refusals (privileges, business rules) become `failed` with the store's reason, made safe to show a user.

### US-9.10 Validation rules at commit

**As a** data owner, **I want** every value checked against its binding's rules by the DBS itself, **so that** bad data can't reach ICIS even from a caller that skips the form.

Notes: rules are a typed list, designed to grow (see US-L.7). Reference: `binding-service/src/validators.ts`, and the proposal's "Adding validation rules".

Acceptance criteria:
- [ ] `maxLength`: a longer value fails with "Longer than the N characters this field allows".
- [ ] `oneOfOptions`: a lookup value must be one of the store's **current** options. If it isn't, it fails with "Not one of the allowed options", and nothing is sent to the store. If the options can't be read, it fails with a clear message rather than writing.
- [ ] A value the store requires can't be cleared: "A value is required here".
- [ ] Rule checks live in one table keyed by rule type, so adding a rule type touches only that table, the shared schema and the form's mirror.

### US-9.11 Lookup options

**As a** form admin, **I want** a lookup's options served live from the store, **so that** forms always offer what ICIS currently holds.

Acceptance criteria:
- [ ] `GET /bindings/:key/options` returns `{ options: [{ value: code, label }], source }`.
  - `source` is `live`, `fallback` (a known list served because the store couldn't be read), or `unavailable`.
- [ ] Only active rows are listed, sorted by label.
- [ ] A non-lookup binding returns 404.

---

## Epic US-10: Data-bound fields in form-builder

### US-10.1 Relay the DBS through form-builder's server

**As a** form-builder developer, **I want** the browser to reach the DBS only through form-builder's own API, **so that** auth, logging and the DBS's address live in one place.

Reference: `server/src/modules/bindings/` (`binding-client.ts`, `routes.ts`).

Acceptance criteria:
- [ ] The server relays these endpoints:
  - `/api/bindings`, `/api/bindings/:key/options` and `/api/anchors/client`;
  - `/api/bindings/resolve`;
  - the binding creator's `/api/binding-admin/*`.
- [ ] The DBS address comes from `BINDING_SERVICE_URL`.
- [ ] The DBS's 404s and 422s pass through with their messages. An unreachable DBS returns 502 "The Data Binding Service is unavailable".
- [ ] Forms without data-bound fields work normally when the DBS is down.

### US-10.2 The bound field type

**As a** form admin, **I want** data-bound fields to be a field type like any other, **so that** they sit alongside custom fields in the same form, preview and fill-out view.

Reference: `shared/src/schemas/field.ts` (`BoundFieldSchema`), `shared/src/json-schema.ts`, `client/src/schema/toJsonSchema.ts`.

Acceptance criteria:
- [ ] A `bound` field holds `id`, `label`, `required`, an optional `presentation` and a **snapshot of the binding's descriptor** taken when the field was added.
- [ ] It renders through the same JSON Schema → JSON Forms pipeline as every other field (ADR-0003, ADR-0005):
  - text gets its maximum length;
  - a lookup becomes a labelled choice of its options (supplied at render time);
  - a read-only binding is `readOnly` and never required;
  - a store-required value is always required.
- [ ] A migration between form versions carries a bound value over only to a field bound to the **same key**.
- [ ] Publishing a form with bound fields works like any other form (ADR-0004).

### US-10.3 A "Data bound" section in the palette

**As a** form admin, **I want** the palette to list the fields I can bind to, **so that** I can drag "First name" onto a form like any other field.

Reference: `client/src/FieldPalette.tsx`, `FormBuilder.tsx`, `FormCanvas.tsx`.

Acceptance criteria:
- [ ] Under **Data bound · Client**, the palette lists every published binding from the DBS, marking read-only ones.
- [ ] Dragging one onto the canvas adds a bound field with the binding's label, a descriptor snapshot and the default presentation.
- [ ] The list reloads when the admin returns to the tab, so a newly published binding appears without reopening the form.
- [ ] If the DBS is unavailable, the section says so and custom fields still work.

### US-10.4 Inspector for a bound field

**As a** form admin, **I want** to see what a bound field is bound to and what I can change, **so that** I don't expect to edit what the binding fixes.

Reference: `client/src/FieldInspector.tsx` (`BoundFieldDetails`).

Acceptance criteria:
- [ ] The inspector shows the binding key and version, the control (text up to N, or a choice from a source-system list), whether it's editable, and its description.
- [ ] The label is editable.
- [ ] *Required* is editable only when the binding allows it. It's forced on, with a note, when ICIS requires a value, and disabled for read-only bindings.
- [ ] **Show as** appears when the binding allows more than one presentation (e.g. Dropdown / Radio buttons), and saves the choice on the field.

### US-10.5 Dropdown or radio buttons

**As a** form admin, **I want** a short list shown as radio buttons, **so that** practitioners see all the choices at once.

Acceptance criteria:
- [ ] A bound lookup renders as a dropdown or as radio buttons, per the field's `presentation` (defaulting to the binding's `default`).
- [ ] Both render the same labelled options, pre-select the resolved value, and submit the same code.
- [ ] A presentation the binding doesn't allow can't be chosen.

### US-10.6 Choose the client and pre-fill

**As a** practitioner, **I want** to choose which client a form is about and see their current values, **so that** I'm working on the right person's record.

Notes: in the real system the embedding session-notes app supplies the client (requirements §9, `embeddable-component.md`); the picker is the stand-in. Reference: `client/src/FormFill.tsx` (`ClientPicker`, `handleClientLoaded`).

Acceptance criteria:
- [ ] A form with bound fields shows a client picker (ICIS client number). A form without them doesn't.
- [ ] Loading a client shows "Filling in for *name* (*number*)" and pre-fills every bound field from `resolve`. The resolved values are kept as the baseline for commit.
- [ ] An unknown number shows "No client found". An unreachable DBS shows a clear message.
- [ ] Changing client replaces the bound values.

### US-10.7 Save bound values on submit, and show what happened

**As a** practitioner, **I want** to know which of my changes reached ICIS, **so that** I can act on anything that didn't.

Reference: `server/src/modules/bindings/services/bound-fields.ts`, `SubmissionsService.submit`, `server/src/db/schema.ts` (`submission_bindings`).

Acceptance criteria:
- [ ] On submit:
  - [ ] The submission is recorded **first**, as today.
  - [ ] Then the writable bound values are committed with the client anchor and baseline.
  - [ ] Drafts don't commit.
- [ ] Each attempt is recorded in `submission_bindings`: the anchor, baseline, values sent and per-binding results.
- [ ] After submit, the page lists each bound field: *Saved to ICIS* / *Unchanged* / *Not saved — changed in ICIS since the form was opened (ICIS now has "…")* / *Not saved — {reason}* / *Not sent*.
- [ ] No client selected means every bound value is *Not sent*.
- [ ] A refused write, or an unreachable DBS, is reported per field. The submission still succeeds.

---

## Epic US-11: Binding creator

Lets data stewards create bindable fields without a developer, within limits set by the allow-list, ICIS's own metadata and the DBS's own privileges. Design: the proposal's "Creating bindings without a developer".

### US-11.1 The allow-list

**As a** data owner, **I want** only approved attributes to be bindable, **so that** sensitive fields can never be put on a form.

Notes: code, changed by pull request and code review, never from the creator. Reference: `binding-service/src/allow-list.ts`.

Acceptance criteria:
- [ ] Per anchor, a list of store attributes, each with a maximum access (`read` or `readWrite`).
- [ ] Attributes not on the list are refused by every creator endpoint.
- [ ] The file documents what is deliberately excluded and why:
  - portal credentials;
  - DEX and government identifiers;
  - statistical linkage keys;
  - FDR case content (§17).

### US-11.2 See what can be bound

**As a** data steward, **I want** to see each approved attribute with ICIS's limits and what the DBS may do with it, **so that** I know what a binding on it can be before I create one.

Reference: `binding-service/src/creator.ts` (`candidates`).

Acceptance criteria:
- [ ] `GET /admin/attributes?anchor=client` lists each allow-listed attribute with:
  - its display name and strategy (`attribute` or `lookup`, or none for unsupported types);
  - its maximum length, whether ICIS requires it, and its lookup target;
  - the **most access a binding may offer**, with notes on why it's capped;
  - **problems** that would block publishing;
  - whether it's already bound, and by which key;
  - its possible presentations.
- [ ] Access is capped at display-only if any of these holds:
  - the allow-list says so;
  - ICIS doesn't allow updates;
  - the DBS account lacks Write on the entity;
  - for a lookup, the account lacks Append, or Append To on the list.
- [ ] A lookup whose list the DBS account can't read is flagged as a publish-blocking problem.

### US-11.3 Create a draft binding

**As a** data steward, **I want** to create a binding on an approved attribute, **so that** a new field becomes available to forms without a developer.

Acceptance criteria:
- [ ] `POST /admin/bindings` takes `{ key, label, description, attribute, access, maxLength?, presentations? }`.
- [ ] The strategy, control kind and limits are **derived from ICIS metadata**. The request can only narrow them:
  - a maximum length above ICIS's is refused;
  - Editable is refused where access is capped;
  - a presentation the strategy can't support is refused.
- [ ] The key must be `client.` followed by a camelCase name, and can't be a built-in binding's key.
- [ ] An attribute can have only one binding, and a key's attribute can never change. Both are enforced by the database, and a concurrent attempt is refused with a clear message.
- [ ] Saving again replaces the draft. Published versions are untouched.

### US-11.4 Publish a binding

**As a** data steward, **I want** to publish a draft, **so that** form admins can use it, and know it won't change under them.

Acceptance criteria:
- [ ] `POST /admin/bindings/:key/publish` publishes the draft as an immutable version.
- [ ] Publishing **re-checks** the allow-list, ICIS metadata and the DBS account's privileges as they are now, and refuses, with the reason, if any would now block it. For example, a lookup whose options can't be read can't be published.
- [ ] A published version can never be updated or deleted. A database trigger enforces this, and it holds even for hand-run SQL.
- [ ] Only published versions appear in `GET /bindings`.

### US-11.5 A new version of a published binding

**As a** data steward, **I want** to change a published binding by publishing a new version, **so that** forms already using the old one keep working as built.

Acceptance criteria:
- [ ] Saving a draft on a published binding creates version N+1 as a draft. Version N is unchanged.
- [ ] Publishing makes N+1 the version served. Forms that snapshotted N keep N's descriptor.
- [ ] At most one draft exists per binding.

### US-11.6 The Data bindings page

**As a** data steward, **I want** a page to do all of this, **so that** I don't need API tools.

Reference: `client/src/DataBindings.tsx`.

Acceptance criteria:
- [ ] Reached from the app's nav, **Data bindings**.
- [ ] **Bindings table:** each binding's label, key, ICIS attribute, how it's shown on forms, version and state (built in / draft / published), with **Publish** for drafts. A refusal is shown on that row.
- [ ] **Create a binding table:** each approved attribute's type, the most it can be, and notes.
  - A note that applies to every attribute (e.g. "the DBS's ICIS account can't write client records") is shown once, as a banner.
  - Offers **Create binding** or **New version**, but nothing for built-in bindings.
- [ ] **Editor:**
  - pre-fills a suggested key (`Preferred Name` → `client.preferredName`) and label;
  - shows what's inherited from ICIS;
  - offers Editable / Display only, disabling Editable with the reason when it's capped;
  - has a maximum length limited to ICIS's, and, for lookups, which presentations forms may use;
  - has **Save draft** and **Save and publish**.
- [ ] The page re-checks the DBS's limits whenever the steward returns to the tab, and before opening the editor.
- [ ] The DBS's refusal messages are shown verbatim.

---

## Epic US-12: Demo and test support

### US-12.1 A mock ICIS

**As a** developer, **I want** a stand-in for ICIS's Dataverse Web API with made-up data, **so that** the whole flow can be developed, tested and demonstrated without a real environment.

Reference: `mock-icis/` (`odata.ts`, `data.ts`, `state.ts`).

Acceptance criteria:
- [ ] Speaks exactly the Web API subset the ICIS adapter uses, with Dataverse's URL shapes, etags, error codes and privilege-error messages:
  - metadata, `WhoAmI` and `RetrieveUserPrivileges`;
  - contact reads and PATCHes with `If-Match`, and lookup binds and `$ref` deletes;
  - lookup lists.
- [ ] Anything outside that subset returns 400 saying so, rather than pretending.
- [ ] Seeded with about 20 made-up clients shaped like ICIS contacts:
  - phone numbers from ACMA's fictional-use ranges, and emails at `example.com`;
  - fake sensitive columns included, to show the allow-list at work.
- [ ] Enforces the demo service account's privileges on every call, and accepts only its demo token.

### US-12.2 Mock ICIS screens

**As a** presenter, **I want** to show the ICIS side of the story, **so that** an audience sees values land, conflicts happen and privileges matter.

Reference: `mock-icis/src/admin.ts`.

Acceptance criteria:
- [ ] **Clients:** list and search, and edit any client as "ICIS staff". Each save bumps the row version, so an open form then gets a conflict.
- [ ] **Service account:** tick or untick the DBS account's privileges per table. They take effect on the DBS's next request.
- [ ] **API log:** every Web API call the DBS made, with status, refreshing automatically.
- [ ] **Reset demo** restores the seed.
- [ ] Clearly labelled as a mock with demo data only.

### US-12.3 Contract test: the real adapter against the mock

**As a** developer, **I want** the DBS's real ICIS adapter and services tested against the mock, **so that** the mock and the adapter can't drift apart unnoticed.

Reference: `mock-icis/src/contract.test.ts`.

Acceptance criteria:
- [ ] Runs the unchanged adapter, service and creator against the mock, in-process.
- [ ] Covers:
  - finding a client, resolving values and codes;
  - the read-only ceiling, and a write refused with its privilege named;
  - creating and publishing bindings, then write-back;
  - a conflict with a staff edit;
  - an invalid option refused before any PATCH is sent;
  - lookup Append / Append To ceilings.

### US-12.4 Demo mode and walkthrough

**As a** presenter, **I want** one command and a script, **so that** anyone can run the demo.

Reference: `binding-service/.env.demo`, root `npm run demo`, [demo walkthrough](../demo/databound-fields-demo.md).

Acceptance criteria:
- [ ] `npm run demo` migrates the DBS demo database and starts the mock ICIS, the DBS (pointed at the mock), and form-builder's server and client.
- [ ] Demo mode uses a static token, refused for any non-localhost ICIS URL, and re-checks privileges on every request.
- [ ] `npm run demo:reset` empties the DBS demo database only.
- [ ] A walkthrough covers each role (developer, ICIS admin, data steward, form admin, practitioner), the safety nets, and talking points.

---

## Epic US-13: Environment and operations

### US-13.1 A dedicated ICIS account for the DBS

**As an** ICIS administrator, **I want** the DBS to have its own least-privilege ICIS account, **so that** its access is deliberate, auditable and independent of other apps.

Notes: the prototype borrowed the `feedback` app's test registration as an agreed stopgap. Reference: [setup guide](../setup/icis-binding-service-account.md).

Acceptance criteria:
- [ ] An Entra app registration and Dataverse application user exist for the DBS, one per environment.
- [ ] A custom security role grants only:
  - Read on Contact and on the lookup tables of allow-listed attributes;
  - Read on User, for the privilege check;
  - Write, Append and Append To added only where bindings must be editable, in test first.
- [ ] Secrets are held in a secret store with a named owner and a renewal date.
- [ ] The DBS's `.env` or config uses it; no other app's credentials remain.

### US-13.2 CI covers the DBS database

**As a** developer, **I want** CI to run the DBS's database-backed tests, **so that** migrations, constraints and the immutability trigger are proven on every change.

Acceptance criteria:
- [ ] CI migrates a DBS test database and runs the Postgres tests for identities and configured bindings.
- [ ] Those tests are skipped, not failed, where no test database is configured.

---

## Later: follow-on stories (not yet designed in detail)

Candidate stories for after the above, from the handover's next steps and the proposal. Each needs its own design pass before it becomes an issue.

- **US-L.1 Outbox for commits.** Queue bound-value commits and retry them, like `feedback`'s ICIS sync. An ICIS or DBS outage then never blocks finalising, and a failed write is retried rather than just reported. DEX timing applies: data written after a session is completed misses the export.
- **US-L.2 Real identity.**
  - Entra sign-in for form-builder, and on-behalf-of tokens from form-builder to the DBS to ICIS, so every write carries the practitioner's own identity.
  - Required by §8 before any real clinical write; a service account asserting a user is prohibited.
  - Includes per-write actor type and provenance.
- **US-L.3 Steward permissions.** Restrict the Data bindings page and `/admin` endpoints to data stewards; changing the allow-list stays a code change.
- **US-L.4 Bound fields in modules and session templates.** Offer the Data bound palette in the module builder, and commit bound values from session-template fills.
- **US-L.5 Resume the client with a draft.** A saved draft remembers which client it was for, and re-resolves on resume.
- **US-L.6 Show failed option loads.** If a lookup's options can't be loaded, show a clear message on the field rather than an empty control.
- **US-L.7 Validation-rule library.**
  - Add `minLength`, `format: email`, named library patterns (`pattern: au-mobile`) and checksum types (Medicare, CRN), picked by stewards from a developer-maintained library. Never steward-authored regex (§3).
  - Distinguish hard store constraints from advisory format rules. An advisory rule follows each form control's severity (assist / warn / block); an accepted warning is recorded as an override, and both raw and normalised values are stored.
- **US-L.8 Linked-data strategies.**
  - `set-membership`: presenting needs, as a many-to-many via a junction table.
  - `child-collection`: referrals per session participant.
  - Both need participant-scoped module types (§7).
- **US-L.9 More than one store.** Per-binding store routing (`source.store`), a second adapter (RAWA's own client system), and commits grouped by store. This is the path for moving bindings off ICIS one at a time, with the new system syncing back to ICIS for DEX. See the proposal's "Beyond Dataverse".
- **US-L.10 Curated option codes.** Developer-maintained code lists for funder-coded lists (e.g. DEX gender codes), instead of codes derived from labels.
- **US-L.11 Retire a binding.** Stop offering a binding to new forms while existing forms keep their snapshot.
- **US-L.12 "Changed in ICIS since" on re-view.** When re-viewing a submission, show where a writable bound value has since changed in ICIS. Read-only referenced values stay pinned (proposal, decision 1).

## Suggested order

1. **US-9.1–9.4:** the service, the adapter contract, the ICIS adapter, the database.
2. **US-12.1 and 12.3:** the mock and the contract test, so everything after can be tested without ICIS.
3. **US-9.5–9.11:** identities, codes, dictionary, resolve, commit, validation, options.
4. **US-10.1–10.7:** form-builder, end to end with the built-in bindings.
5. **US-11.1–11.6:** the binding creator.
6. **US-12.2, 12.4, 13.1, 13.2:** demo, account and CI, alongside the above as needed.
7. **Later:** US-L.2 (real identity) and US-L.1 (outbox) come **before any real client data**. The rest by priority.
