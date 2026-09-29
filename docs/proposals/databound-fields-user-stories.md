# User stories: Data-bound fields and the Data Binding Service

## Status

Candidate user stories, not yet GitHub issues. Written 2026-09-29 so the data-bound fields work can be handed to a developer and built properly, not just prototyped.

- **Design:** [databound-fields.md](databound-fields.md) (the why, the contract, the guardrails).
- **Contracts are in this document.** The [Appendix](#appendix-contracts-api-and-schemas) defines every data contract, the Data Binding Service's HTTP API (with an OpenAPI 3.1 definition), form-builder's relay endpoints, the store adapter interface, both database schemas (SQL), the built-in bindings and allow-list, the mock ICIS subset, and the user-facing messages. Each story links the sections it needs.
- **A working prototype exists** in PRs richard-orchard-rewa/formbuilder#81 (merged) and richard-orchard-rewa/formbuilder#82, for anyone who wants to see one way of doing it. Where the prototype and this document differ, this document is the spec.
- **Where it got to:** [handover](../handover/databound-fields.md).

Epics continue the repo's numbering (`US-0`–`US-8` are taken): **US-9** the Data Binding Service, **US-10** data-bound fields in form-builder, **US-11** the binding creator, **US-12** demo and test support, **US-13** environment and operations, **US-14** sessions, cases and participants. The "Later" section lists follow-on stories not yet designed in detail.

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

Notes: a separate deployable, today a workspace (`binding-service/`), built to be liftable into its own repo. Fastify, as in the rest of the repo.

Contract: Appendix [B](#b-data-binding-service-http-api).

Acceptance criteria:
- [ ] `GET /` returns the service's name and purpose, its anchors, its strategies and every endpoint with a one-line description.
- [ ] `GET /health` returns 200 when the service is ready.
- [ ] Configuration comes from environment variables only: the store adapter, its connection details, `DATABASE_URL` and the port. A committed `.env.sample` documents every variable, with no secrets.
- [ ] The service binds to localhost by default and logs a startup line with its adapter and database name (no secrets).
- [ ] Nothing in `binding-service/` imports from form-builder's `server/` or `client/`.

### US-9.2 Store adapter contract, and an in-memory fake

**As a** DBS developer, **I want** one interface every backing store implements, **so that** ICIS can be replaced by another store without touching the rest of the DBS.

Notes: the contract covers the reads and writes the DBS needs, plus metadata and the account's own privileges. Every store has a **name** (`icis`, `fake`), which keys identity references.

Contract: Appendix [D](#d-store-adapter-interface).

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

Notes: this is the only ICIS-aware code. Plain `fetch` against Web API v9.2 was enough for the prototype. The prototype used client-credentials auth; see US-L.2 for the identity model production needs.

Contract: Appendix [D](#d-store-adapter-interface), [H](#h-messages).

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

Notes: Postgres + Drizzle, following ADR-0001.

Contract: Appendix [E.1](#e1-the-dbss-own-database).

Acceptance criteria:
- [ ] A separate database (`binding_service`; `binding_service_demo` for demos). form-builder's database is never used or touched.
- [ ] `npm run db:migrate -w binding-service` creates the database if missing, then applies migrations. It's idempotent.
- [ ] The DBS **refuses to start** against a real store without `DATABASE_URL`. Only the in-memory fake may run without a database.
- [ ] A reset script empties the tables of `*_demo` or `*_test` databases only, and refuses any other name.
- [ ] CI runs the database-backed tests against a real Postgres.

### US-9.5 DBS-issued client identities (anchors)

**As a** form admin and practitioner, **I want** forms to identify a client by a DBS-issued ID, **so that** stored submissions stay valid when client data moves out of ICIS.

Notes: an anchor ID maps to the client's record in each store (`{ refs: { icis: <contact guid> } }`).

Contract: Appendix [A.2](#a2-options-and-anchors), [E.1](#e1-the-dbss-own-database).

Acceptance criteria:
- [ ] `GET /anchors/client?clientNumber=` returns `{ id, clientNumber, displayName }`, or 404 when there's no unambiguous match. `id` is a DBS-issued ID, never the store's record ID.
- [ ] The same store record always yields the same anchor ID, including under concurrent requests (a transaction-scoped lock plus a unique index on store and record).
- [ ] Resolve and commit accept only DBS anchor IDs. A store record ID is refused as unknown.
- [ ] A store record belongs to exactly one anchor. An anchor has at most one reference per store.

### US-9.6 Logical option codes

**As a** form admin, **I want** lookup values stored as logical codes, **so that** a submission's "Title: Ms" still means Ms after the list moves to another store or is relabelled.

Notes: codes are derived from the label the first time the DBS sees a row, then kept.

Contract: Appendix [A.2](#a2-options-and-anchors), [E.1](#e1-the-dbss-own-database).

Acceptance criteria:
- [ ] Options are served as `{ value: <code>, label }`, never with store row IDs.
- [ ] A new row's code is its label slugified (`Not Stated` → `not-stated`) and unique within its list (`-2`, `-3`, …).
- [ ] A row keeps its code when its label changes.
- [ ] Codes are assigned consistently under concurrent requests.
- [ ] On commit, a code is translated to the store's row ID. An unknown code, or a store row ID sent as a value, is refused.
- [ ] A value read from the store whose row isn't in the current list (e.g. deactivated) still gets a stable code.

### US-9.7 Binding dictionary and self-describing descriptors

**As a** form-builder developer, **I want** every binding described completely by its descriptor, **so that** form-builder can render, validate, read and write it without knowing DBS URL conventions.

Notes: built-in bindings are code; configured ones come from US-11.

Contract: Appendix [A.1](#a1-binding-descriptors), [F](#f-built-in-bindings-and-the-allow-list).

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

Contract: Appendix [A.3](#a3-resolve-and-commit), [B](#b-data-binding-service-http-api).

Acceptance criteria:
- [ ] `POST /resolve { anchor, bindings[] }` returns `{ values, resolvedAt }`, keyed by binding key: text as-is, lookups as codes, and `null` for no value.
- [ ] Unknown bindings return 404, naming them. An unknown anchor returns 404.
- [ ] One store read per request, whatever the number of bindings.

### US-9.9 Commit changed values safely

**As a** practitioner, **I want** my edits saved back to ICIS without overwriting anyone else's, **so that** a colleague's newer change is never silently lost.

Contract: Appendix [A.3](#a3-resolve-and-commit), [H](#h-messages).

Acceptance criteria:
- [ ] `POST /commit { anchor, values, baseline? }` returns a per-binding result: `written`, `unchanged`, `conflict` (with the store's `current` value), `readOnly`, or `failed` (with a message).
- [ ] Only changed values are written. Blank text means "no value".
- [ ] If `baseline` is given and the store's value no longer matches it, the result is `conflict`, and that value isn't written.
- [ ] All changed values are written in **one conditional update**. A change landing between the read and the write fails the write rather than half-applying it.
- [ ] Read-only bindings are never written.
- [ ] Store refusals (privileges, business rules) become `failed` with the store's reason, made safe to show a user.

### US-9.10 Validation rules at commit

**As a** data owner, **I want** every value checked against its binding's rules by the DBS itself, **so that** bad data can't reach ICIS even from a caller that skips the form.

Notes: rules are a typed list, designed to grow (see US-L.7).

Contract: Appendix [A.1](#a1-binding-descriptors), [H](#h-messages).

Acceptance criteria:
- [ ] `maxLength`: a longer value fails with "Longer than the N characters this field allows".
- [ ] `oneOfOptions`: a lookup value must be one of the store's **current** options. If it isn't, it fails with "Not one of the allowed options", and nothing is sent to the store. If the options can't be read, it fails with a clear message rather than writing.
- [ ] A value the store requires can't be cleared: "A value is required here".
- [ ] Rule checks live in one table keyed by rule type, so adding a rule type touches only that table, the shared schema and the form's mirror.

### US-9.11 Lookup options

**As a** form admin, **I want** a lookup's options served live from the store, **so that** forms always offer what ICIS currently holds.

Contract: Appendix [A.2](#a2-options-and-anchors), [B](#b-data-binding-service-http-api).

Acceptance criteria:
- [ ] `GET /bindings/:key/options` returns `{ options: [{ value: code, label }], source }`.
  - `source` is `live`, `fallback` (a known list served because the store couldn't be read), or `unavailable`.
- [ ] Only active rows are listed, sorted by label.
- [ ] A non-lookup binding returns 404.

---

## Epic US-10: Data-bound fields in form-builder

### US-10.1 Relay the DBS through form-builder's server

**As a** form-builder developer, **I want** the browser to reach the DBS only through form-builder's own API, **so that** auth, logging and the DBS's address live in one place.

Contract: Appendix [C](#c-form-builders-relay-api).

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

Contract: Appendix [A.5](#a5-form-builder-additions), [E.2](#e2-form-builders-database-one-new-table).

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

Contract: Appendix [A.1](#a1-binding-descriptors).

Acceptance criteria:
- [ ] Under **Data bound · Client**, the palette lists every published binding from the DBS, marking read-only ones.
- [ ] Dragging one onto the canvas adds a bound field with the binding's label, a descriptor snapshot and the default presentation.
- [ ] The list reloads when the admin returns to the tab, so a newly published binding appears without reopening the form.
- [ ] If the DBS is unavailable, the section says so and custom fields still work.

### US-10.4 Inspector for a bound field

**As a** form admin, **I want** to see what a bound field is bound to and what I can change, **so that** I don't expect to edit what the binding fixes.

Contract: Appendix [A.1](#a1-binding-descriptors), [A.5](#a5-form-builder-additions).

Acceptance criteria:
- [ ] The inspector shows the binding key and version, the control (text up to N, or a choice from a source-system list), whether it's editable, and its description.
- [ ] The label is editable.
- [ ] *Required* is editable only when the binding allows it. It's forced on, with a note, when ICIS requires a value, and disabled for read-only bindings.
- [ ] **Show as** appears when the binding allows more than one presentation (e.g. Dropdown / Radio buttons), and saves the choice on the field.

### US-10.5 Dropdown or radio buttons

**As a** form admin, **I want** a short list shown as radio buttons, **so that** practitioners see all the choices at once.

Contract: Appendix [A.5](#a5-form-builder-additions).

Acceptance criteria:
- [ ] A bound lookup renders as a dropdown or as radio buttons, per the field's `presentation` (defaulting to the binding's `default`).
- [ ] Both render the same labelled options, pre-select the resolved value, and submit the same code.
- [ ] A presentation the binding doesn't allow can't be chosen.

### US-10.6 Choose the client and pre-fill

**As a** practitioner, **I want** to choose which client a form is about and see their current values, **so that** I'm working on the right person's record.

Notes: in the real system the embedding session-notes app supplies the client (requirements §9, `embeddable-component.md`); the picker is the stand-in.

Contract: Appendix [A.2](#a2-options-and-anchors), [A.3](#a3-resolve-and-commit), [C](#c-form-builders-relay-api).

Acceptance criteria:
- [ ] A form with bound fields shows a client picker (ICIS client number). A form without them doesn't.
- [ ] Loading a client shows "Filling in for *name* (*number*)" and pre-fills every bound field from `resolve`. The resolved values are kept as the baseline for commit.
- [ ] An unknown number shows "No client found". An unreachable DBS shows a clear message.
- [ ] Changing client replaces the bound values.

### US-10.7 Save bound values on submit, and show what happened

**As a** practitioner, **I want** to know which of my changes reached ICIS, **so that** I can act on anything that didn't.

Contract: Appendix [A.3](#a3-resolve-and-commit), [A.5](#a5-form-builder-additions), [E.2](#e2-form-builders-database-one-new-table), [H](#h-messages).

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

Notes: code, changed by pull request and code review, never from the creator.

Contract: Appendix [F](#f-built-in-bindings-and-the-allow-list).

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

Contract: Appendix [A.4](#a4-binding-creator).

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

Contract: Appendix [A.4](#a4-binding-creator), [H](#h-messages).

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

Contract: Appendix [A.4](#a4-binding-creator), [E.1](#e1-the-dbss-own-database).

Acceptance criteria:
- [ ] `POST /admin/bindings/:key/publish` publishes the draft as an immutable version.
- [ ] Publishing **re-checks** the allow-list, ICIS metadata and the DBS account's privileges as they are now, and refuses, with the reason, if any would now block it. For example, a lookup whose options can't be read can't be published.
- [ ] A published version can never be updated or deleted. A database trigger enforces this, and it holds even for hand-run SQL.
- [ ] Only published versions appear in `GET /bindings`.

### US-11.5 A new version of a published binding

**As a** data steward, **I want** to change a published binding by publishing a new version, **so that** forms already using the old one keep working as built.

Contract: Appendix [A.4](#a4-binding-creator), [E.1](#e1-the-dbss-own-database).

Acceptance criteria:
- [ ] Saving a draft on a published binding creates version N+1 as a draft. Version N is unchanged.
- [ ] Publishing makes N+1 the version served. Forms that snapshotted N keep N's descriptor.
- [ ] At most one draft exists per binding.

### US-11.6 The Data bindings page

**As a** data steward, **I want** a page to do all of this, **so that** I don't need API tools.

Contract: Appendix [A.4](#a4-binding-creator), [H](#h-messages).

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

Contract: Appendix [G](#g-mock-icis-api-subset), [D](#d-store-adapter-interface).

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

Contract: Appendix [G](#g-mock-icis-api-subset).

Acceptance criteria:
- [ ] **Clients:** list and search, and edit any client as "ICIS staff". Each save bumps the row version, so an open form then gets a conflict.
- [ ] **Service account:** tick or untick the DBS account's privileges per table. They take effect on the DBS's next request.
- [ ] **API log:** every Web API call the DBS made, with status, refreshing automatically.
- [ ] **Reset demo** restores the seed.
- [ ] Clearly labelled as a mock with demo data only.

### US-12.3 Contract test: the real adapter against the mock

**As a** developer, **I want** the DBS's real ICIS adapter and services tested against the mock, **so that** the mock and the adapter can't drift apart unnoticed.

Contract: Appendix [D](#d-store-adapter-interface), [G](#g-mock-icis-api-subset).

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

Contract: Appendix [G](#g-mock-icis-api-subset). See also [demo walkthrough](../demo/databound-fields-demo.md).

Acceptance criteria:
- [ ] `npm run demo` migrates the DBS demo database and starts the mock ICIS, the DBS (pointed at the mock), and form-builder's server and client.
- [ ] Demo mode uses a static token, refused for any non-localhost ICIS URL, and re-checks privileges on every request.
- [ ] `npm run demo:reset` empties the DBS demo database only.
- [ ] A walkthrough covers each role (developer, ICIS admin, data steward, form admin, practitioner), the safety nets, and talking points.

---

## Epic US-13: Environment and operations

### US-13.1 A dedicated ICIS account for the DBS

**As an** ICIS administrator, **I want** the DBS to have its own least-privilege ICIS account, **so that** its access is deliberate, auditable and independent of other apps.

Notes: the prototype borrowed the `feedback` app's test registration as an agreed stopgap.

Contract: Appendix [D](#d-store-adapter-interface). See also [setup guide](../setup/icis-binding-service-account.md).

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

Contract: Appendix [E.1](#e1-the-dbss-own-database).

Acceptance criteria:
- [ ] CI migrates a DBS test database and runs the Postgres tests for identities and configured bindings.
- [ ] Those tests are skipped, not failed, where no test database is configured.

---

## Epic US-14: Sessions, cases and participants

Data-bound content at the session and participant levels (§16), including joint and group sessions with several participants. Design: the proposal's "Anchors beyond the client". Stories 14.1–14.11 are the prototype slice; 14.12–14.16 are designed but not yet built.

### US-14.1 Session and participant anchors

**As a** DBS developer, **I want** sessions and session participants to be anchors like clients, **so that** content can be bound to a session, or to one person's attendance at it.

Contract: Appendix [A.6](#a6-sessions-and-participants), [E.1](#e1-the-dbss-own-database).

Acceptance criteria:
- [ ] New anchor types `session` (ICIS `wp_session`) and `participant` (ICIS `csg_attendance`: one person at one session).
- [ ] Both get DBS-issued IDs mapped to their store records, like clients (US-9.5). Store IDs never cross the API.
- [ ] `AnchorContext` names exactly one anchor: `{ client }`, `{ session }` or `{ participant }`.

### US-14.2 A client's sessions and their participants

**As a** practitioner, **I want** to pick one of a client's sessions and see who took part, **so that** I can write that session's note for everyone in it.

Notes: in the real system the session-notes app supplies the session (§9); this is the lookup that makes the prototype's picker possible.

Contract: Appendix [A.6](#a6-sessions-and-participants), [B](#b-data-binding-service-http-api).

Acceptance criteria:
- [ ] `GET /anchors/sessions?clientNumber=` returns the sessions the client has an attendance record for, newest first. Each session has its anchor ID, start, end and subject.
- [ ] Each session lists its participants, each with:
  - its participant anchor ID;
  - its client (`ClientAnchor`: anchor ID, number, name);
  - its attendance status label.
- [ ] Unknown or ambiguous client numbers return 404.

### US-14.3 Session bindings from the booking

**As a** practitioner, **I want** a session note to show the session's details from ICIS, **so that** I don't retype what the booking already holds.

Contract: Appendix [A.6](#a6-sessions-and-participants), [F](#f-built-in-bindings-and-the-allow-list).

Acceptance criteria:
- [ ] Built-in, read-only bindings anchored on `session`: `session.subject`, `session.start` and `session.end`.
- [ ] Their values resolve with `{ session }`. Dates and times arrive as ISO 8601.

### US-14.4 The `choice` strategy (option sets)

**As a** DBS developer, **I want** option-set attributes bindable like lookups, **so that** fields like attendance status can be shown and saved without forms holding Dataverse integers.

Contract: Appendix [A.1](#a1-binding-descriptors), [D](#d-store-adapter-interface).

Acceptance criteria:
- [ ] A `choice` strategy for Dataverse option sets (picklists).
- [ ] Its options come from the attribute's option-set metadata, served as codes (`attended`, `dna`) with labels.
- [ ] Its value is stored as the option's integer, and translated to and from codes by the DBS (US-9.6).
- [ ] It's rendered like a lookup (dropdown or radio buttons), and validated with `oneOfOptions`.
- [ ] Built-in binding `participant.attendance` (`csg_attendance.wp_attendancestatus`) is writable.

### US-14.5 Bindings used with the right anchor

**As a** DBS developer, **I want** resolve and commit to refuse a binding used with the wrong anchor, **so that** a client's value can never be written onto a session, or the other way round.

Acceptance criteria:
- [ ] Each resolve or commit request names one anchor. Every binding in it must be anchored on that type, or the request is refused (400) naming the mismatched bindings.
- [ ] Each commit writes one record, conditionally (US-9.9).

### US-14.6 Module scope

**As a** form admin, **I want** to say whether a module is filled in once per session or once per participant, **so that** outcomes or presenting needs are captured for each person in a joint session.

Contract: Appendix [A.6](#a6-sessions-and-participants).

Acceptance criteria:
- [ ] A module has a scope: **once per session** (the default) or **once per participant**. It's chosen in the module builder and published with the module version.
- [ ] The module builder's Data bound palette offers only the bindings the scope can reach:
  - once per session: `session` bindings;
  - once per participant: `participant` and `client` bindings.
- [ ] Changing a published module's scope creates a new version, like any change.

### US-14.7 Session templates keep their modules as sections

**As a** form admin, **I want** a session template to know which fields came from which module, and each module's scope, **so that** per-participant modules can repeat.

Acceptance criteria:
- [ ] A published session template version holds, as well as its flat field list, a list of **sections**, one per module in order: the module's ID, name, scope and fields.
- [ ] Versions published before sections existed still load and fill as before, as one section.

### US-14.8 Choose the session when filling in

**As a** practitioner, **I want** to choose the session a note is for, **so that** it's written against the right session and its participants.

Acceptance criteria:
- [ ] A session template with a participant-scoped module, or any bound field, shows a session picker. You enter a client number, then choose one of their sessions (subject, date and time, participants).
- [ ] Choosing a session pre-fills every session binding.

### US-14.9 Per-participant sections

**As a** practitioner, **I want** each participant-scoped module shown once for each person, **so that** I record each person's outcomes separately.

Acceptance criteria:
- [ ] Session-scoped modules render once. Participant-scoped modules render once per participant, headed with their name and client number.
- [ ] Each instance's bound fields pre-fill from its own anchors: its attendance record for `participant` bindings, and that participant's contact for `client` bindings.
- [ ] Required fields are enforced for every instance.

### US-14.10 Save per participant, and show where each value went

**As a** practitioner, **I want** each participant's changes saved to their own records, **so that** Aisha's preferred name never lands on Tariq's record.

Contract: Appendix [A.6](#a6-sessions-and-participants), [E.2](#e2-form-builders-database-one-new-table).

Acceptance criteria:
- [ ] The submission stores session values at the top level, and participant values under `participants[<participant anchor id>]`.
- [ ] After saving, bound values are committed per anchor:
  - once for the session, with `{ session }`;
  - once per participant with `{ participant }`, and once per participant's client with `{ client }`.
  Each commit carries its own baseline.
- [ ] Each attempt is recorded. The results come back grouped: `{ session, participants: { <id>: … } }`.
- [ ] After submit, the page shows the results per section and per participant.
- [ ] One participant's write failing doesn't stop the others, or the submission.

### US-14.11 View a session note by section and participant

**As a** practitioner or reviewer, **I want** a saved session note shown the way it was filled in, **so that** each person's entries are clearly theirs.

Acceptance criteria:
- [ ] The submission view renders session sections once, and participant sections once per participant stored, read-only.

### US-14.12 Case anchor and case-level modules (designed, not built)

**As a** practitioner, **I want** case-level content bound to the case, **so that** closure forms and case documents attach to the case once.

Acceptance criteria:
- [ ] A `case` anchor (ICIS `incident`) and once-per-case module scope.
- [ ] A session derives its case one-to-one, so case bindings may appear in session-scoped modules.

### US-14.13 Case participants (designed, not built)

**As a** practitioner, **I want** per-person content at case level, **so that** a co-parent's presenting needs on a case are recorded once, not every session.

Acceptance criteria:
- [ ] A `caseParticipant` anchor (ICIS `csg_caseclients`) and once-per-case-participant scope.
- [ ] The eligibility rule (which people on a case get an instance) is confirmed and implemented.

### US-14.14 Bindings on related records (designed, not built)

**As a** data steward, **I want** a binding to reach a record one step from its anchor, **so that** a session note can show the case's programme.

Acceptance criteria:
- [ ] A binding source can carry a developer-maintained path of one-to-one lookup steps.
- [ ] Read-only first; writing through a path is designed separately.

### US-14.15 Mark a participant instance as not completed (designed, not built)

**As a** practitioner, **I want** to finalise a joint session note when one participant left early, **so that** I'm not forced to invent values (§8, §16).

Acceptance criteria:
- [ ] A participant instance can be marked "not completed", with a reason. Its required fields are then not enforced, and it's shown as such.

### US-14.16 The disclosure boundary for joint sessions (needs a decision first)

**As a** privacy officer, **I want** exports and subject-access responses to include only the requesting participant's content, **so that** one participant's disclosures aren't released to another (§16).

Acceptance criteria:
- [ ] The rule is decided with legal and privacy input, then enforced in every export path. The per-participant storage shape (US-14.10) is what makes this possible.

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
  - Both need participant-scoped modules (US-14).
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
7. **US-14.1–14.11:** sessions and participants, once the client-level flow is solid. US-14.12–14.16 follow their decisions.
8. **Later:** US-L.2 (real identity) and US-L.1 (outbox) come **before any real client data**. The rest by priority.

---

## Appendix: contracts, API and schemas

Everything a developer needs to build against, in one place. It matches the prototype as of 2026-09-29.
- Where the prototype and this appendix differ, **this appendix is the spec**.
- Types are TypeScript. In the repo they're defined once as Zod schemas in `shared` and inferred, per ADR-0005.
- Every field shown is required unless marked `?` (optional) or `| null`.

### A. Data contracts

#### A.1 Binding descriptors

```ts
// The record a binding is "about". Only `client` exists so far.
type BindingAnchor = "client"

// How a binding's value is read and written. Strategies are code;
// a binding is a strategy plus configuration.
type BindingStrategy = "attribute" | "lookup"

// How a form may present the value. The binding allows some; the form
// admin picks one per form.
type BindingPresentation = "text" | "dropdown" | "radio"

type BindingControl =
  | { kind: "text"; maxLength?: number }   // maxLength: positive integer
  | { kind: "lookup" }                      // a choice from the binding's options

// A rule a value must satisfy. Enforced by the DBS on commit; mirrored by
// the form. A discriminated union so new rule types are added as members.
type BindingValidationRule =
  | { type: "maxLength"; value: number }    // positive integer
  | { type: "oneOfOptions" }                // must be one of the current options

// One dictionary entry, as GET /bindings and GET /bindings/:key return it.
interface BindingDescriptor {
  key: string                  // logical, store-agnostic: "client.preferredName"
  version: number              // positive integer; the binding's own version
  label: string                // default label; a form may override it
  description: string
  anchor: BindingAnchor
  access: "read" | "readWrite" // read = display only, never written
  control: BindingControl
  overridable: Array<"label" | "required">  // what a form may change

  // Always sent by the DBS. Optional only so descriptors snapshotted into
  // forms before these fields existed still load.
  presentations?: {
    allowed: BindingPresentation[]   // at least one
    default: BindingPresentation     // one of `allowed`
  }
  options?: {                        // lookups only
    href: string                     // e.g. "/bindings/client.title/options"
    allowBlank: boolean              // true unless the store requires a value
  }
  validation?: {
    required: boolean                // what the STORE demands
    rules: BindingValidationRule[]
  }
  operations?: {
    resolve: { href: string }                          // "/resolve"
    commit: { href: string; strategy: BindingStrategy } // "/commit"
  }
}
```

Example: Title, as served:

```json
{
  "key": "client.title", "version": 1, "label": "Title",
  "description": "The client's title (Mr, Ms, ...), from the salutation list.",
  "anchor": "client", "access": "readWrite",
  "control": { "kind": "lookup" },
  "overridable": ["label", "required"],
  "presentations": { "allowed": ["dropdown", "radio"], "default": "dropdown" },
  "options": { "href": "/bindings/client.title/options", "allowBlank": true },
  "validation": { "required": false, "rules": [{ "type": "oneOfOptions" }] },
  "operations": {
    "resolve": { "href": "/resolve" },
    "commit": { "href": "/commit", "strategy": "lookup" }
  }
}
```

**Defaults the DBS fills in** when a stored descriptor lacks a part:
- `presentations`: `attribute` → `{ allowed: ["text"], default: "text" }`; `lookup` → `{ allowed: ["dropdown", "radio"], default: "dropdown" }`.
- `validation`: `required: false`. The rules are `[{ type: "oneOfOptions" }]` for a lookup, or `[{ type: "maxLength", value: control.maxLength }]` for text with a maximum length.
- `options`: `href` is `/bindings/<url-encoded key>/options`, and `allowBlank` is `!validation.required`.
- `operations`: as in the example.

#### A.2 Options and anchors

```ts
interface BindingOption {
  value: string   // a logical option CODE ("mr", "not-stated"), never a store row ID
  label: string
}

interface BindingOptions {
  options: BindingOption[]
  // live: read from the store now
  // fallback: the store couldn't be read; a known-good list was served
  // unavailable: neither; the DBS's account can't read the list
  source: "live" | "fallback" | "unavailable"
}

// GET /anchors/client?clientNumber=. The client to anchor a form on.
interface ClientAnchor {
  id: string                  // a DBS-ISSUED anchor ID (UUID), never the store's record ID
  clientNumber: string | null
  displayName: string         // "First Last", or "(no name)"
}

// Which record a resolve or commit applies to.
interface AnchorContext {
  client: string              // a DBS anchor ID, as ClientAnchor.id
}
```

#### A.3 Resolve and commit

```ts
// A bound value: text, or a lookup's option code. null means no value.
type BoundValue = string | null
type BoundValues = Record<string /* binding key */, BoundValue>

interface ResolveRequest {
  anchor: AnchorContext
  bindings: string[]          // binding keys; at least one
}
interface ResolveResponse {
  values: BoundValues         // one entry per requested key
  resolvedAt: string          // ISO 8601 date-time
}

interface CommitRequest {
  anchor: AnchorContext
  values: BoundValues         // the values the form now holds
  baseline?: BoundValues      // what resolve returned when the form was opened
}

type BindingCommitStatus =
  | "written"    // saved to the store
  | "unchanged"  // equal to the store's current value; nothing sent
  | "conflict"   // the store's value changed since `baseline`; not written
  | "readOnly"   // a display-only binding; never written
  | "failed"     // refused by a rule, the store, or an outage; see `message`
  | "skipped"    // form-builder only: no client selected, so nothing was sent

interface BindingCommitResult {
  status: BindingCommitStatus
  message?: string            // safe to show a user
  current?: BoundValue        // conflict only: the store's value now
}

interface CommitResponse {
  results: Record<string /* binding key */, BindingCommitResult>
}
```

**Commit algorithm.** For each requested binding, in this order:
1. `access: "read"` → `readOnly`.
2. The new value (trimmed; blank means `null`) equals the store's current value → `unchanged`.
3. `baseline` has this key, and it differs from the store's current value → `conflict`, with `current`.
4. The value fails validation (A.1 rules, then `required` for `null`) → `failed`, with the rule's message.
5. Otherwise it's queued.

Then every queued value is written in **one** conditional update against the row version just read. If that succeeds, each is `written`. If the store refuses or the row changed, each queued key is `failed` with the reason.

#### A.4 Binding creator

```ts
// GET /admin/attributes. One allow-listed store attribute a binding could use.
interface AttributeCandidate {
  attribute: string               // store attribute name (DBS-internal; shown to stewards only)
  displayName: string             // the store's own label, e.g. "Preferred Name"
  strategy: BindingStrategy | null // null: no strategy for this type yet
  maxLength: number | null        // the store's limit
  storeRequired: boolean
  lookupTarget: string | null     // the reference table, for lookups
  maxAccess: "read" | "readWrite" // the most a binding may offer
  accessNotes: string[]           // why access is capped at read, if it is
  problems: string[]              // what would block publishing
  boundBy: string | null          // the key already bound to it
  presentations: BindingPresentation[] // what a binding on it could allow
}

interface BindingVersion {
  version: number
  status: "draft" | "published"
  descriptor: BindingDescriptor
  createdAt: string               // ISO 8601
  publishedAt: string | null
}

// GET /admin/bindings. Every binding and version, drafts included.
interface ManagedBinding {
  key: string
  origin: "code" | "configured"   // built in, or created by a steward
  attribute: string
  versions: BindingVersion[]
}

// POST /admin/bindings. Creates or replaces the binding's draft.
interface CreateBindingRequest {
  key: string                     // /^client\.[a-z][A-Za-z0-9]{1,48}$/
  label: string                   // trimmed, non-empty
  description?: string            // trimmed; default ""
  attribute: string               // must be allow-listed
  access: "read" | "readWrite"
  maxLength?: number              // may only narrow the store's limit
  presentations?: BindingPresentation[] // at least one; may only narrow; first = default
}
```

The **access ceiling**, i.e. how `maxAccess` and `accessNotes` are computed. Access is `read` if any of these holds:
- the allow-list entry's `maxAccess` is `read`;
- the store says the attribute isn't updatable;
- the DBS account lacks Write on the entity;
- for a lookup, the account lacks Append on the entity or Append To on the target.

**Problems** (these block publishing):
- no strategy for the attribute's type;
- the account lacks Read on the entity;
- for a lookup, the account lacks Read on the target.

#### A.5 form-builder additions

```ts
// A new member of form-builder's Field union.
interface BoundField {
  id: string                      // form-builder's field ID
  type: "bound"
  label: string                   // may override the binding's label
  required: boolean               // default false
  binding: BindingDescriptor      // SNAPSHOT taken when the field was added
  presentation?: BindingPresentation // one of binding.presentations.allowed
}

// Added to form-builder's submit request (POST /api/forms/:formId/submissions).
interface SubmitForm {
  data: Record<string, unknown>
  submittedBy?: string
  submissionId?: string
  binding?: {                     // omitted when no client was chosen
    anchor: AnchorContext
    baseline?: BoundValues        // the values resolved when the form opened
  }
}

// Added to form-builder's Submission response.
interface Submission {
  // ...existing fields...
  bindingResults?: Record<string /* binding key */, BindingCommitResult>
}
```

**Rendering a bound field** (JSON Schema, then JSON Forms):
- **text:** a string, with `maxLength` from its rules.
- **lookup:** a `oneOf` of `{ const: code, title: label }`, from the options fetched at render time. With no options yet, it's a plain string.
- **read-only binding:** `readOnly: true`, and never required.
- **writable binding:** required if `field.required || binding.validation.required`.
- **radio:** a lookup whose presentation is `radio` gets UI-schema `options.format: "radio"`.

#### A.6 Sessions and participants

Extends A.1–A.5 for session- and participant-level content (US-14).

```ts
type BindingAnchor = "client" | "session" | "participant"
type BindingStrategy = "attribute" | "lookup" | "choice"   // choice: a Dataverse option set

// Names exactly one anchor.
type AnchorContext = { client: string } | { session: string } | { participant: string }

// GET /anchors/sessions?clientNumber=
interface SessionParticipant {
  id: string                    // DBS participant anchor ID (one person at this session)
  client: ClientAnchor          // that person, as a client anchor (A.2)
  attendance: string | null     // attendance status label, e.g. "Attended"
}
interface SessionAnchor {
  id: string                    // DBS session anchor ID
  subject: string | null
  start: string | null          // ISO 8601
  end: string | null
  participants: SessionParticipant[]
}

// form-builder: a module's scope, published with the module version.
type ModuleScope = "session" | "participant"
interface ModuleSchema { fields: Field[]; scope?: ModuleScope }   // absent = "session"

// form-builder: a session template version keeps its modules as sections.
interface SessionTemplateSection {
  moduleId: string
  moduleName: string
  scope: ModuleScope
  fields: Field[]
}
interface SessionTemplateSchema {
  fields: Field[]                        // flat, as before
  sections?: SessionTemplateSection[]    // absent on versions published before sections
}

// form-builder: submitting a session template with bound fields.
interface SubmitSessionTemplate {
  data: Record<string, unknown>          // session fields at top level, plus:
                                         //   participants: { [participantAnchorId]: { [fieldId]: value } }
  submittedBy?: string
  binding?: {
    session: string                      // session anchor ID
    participants: Array<{ participant: string; client: string }>
    baseline?: {
      session?: BoundValues
      participants?: Record<string, { participant?: BoundValues; client?: BoundValues }>
    }
  }
}
interface SessionTemplateBindingResults {
  session?: Record<string, BindingCommitResult>
  participants?: Record<string, Record<string, BindingCommitResult>>
}
```

Commit per anchor: session bindings with `{ session }`, each participant's `participant` bindings with `{ participant }`, and their `client` bindings with `{ client }`. Each commit is one conditional write to one record (A.3).

### B. Data Binding Service HTTP API

JSON over HTTP, served on port 3100 by default. Requests are validated against the contracts in A, and a malformed request returns 400.

| Method and path | Request | 200 response | Errors |
|---|---|---|---|
| `GET /` | — | Service description (below) | — |
| `GET /health` | — | `{ ok: true }` | — |
| `GET /bindings?anchor=client` | `anchor` optional | `BindingDescriptor[]` (published only) | — |
| `GET /bindings/:key` | — | `BindingDescriptor` | 404 unknown binding |
| `GET /bindings/:key/options` | — | `BindingOptions` | 404 unknown or not a lookup |
| `GET /anchors/client?clientNumber=` | `clientNumber` required | `ClientAnchor` | 404 no unambiguous match |
| `POST /resolve` | `ResolveRequest` | `ResolveResponse` | 404 unknown binding(s) or anchor |
| `POST /commit` | `CommitRequest` | `CommitResponse` | 404 unknown binding(s) or anchor |
| `GET /admin/attributes?anchor=client` | `anchor` default `client` | `AttributeCandidate[]` | — |
| `GET /admin/bindings` | — | `ManagedBinding[]` | — |
| `POST /admin/bindings` | `CreateBindingRequest` | `ManagedBinding` | 422 rule refused (A.4, H) |
| `POST /admin/bindings/:key/publish` | — | `ManagedBinding` | 404 no such configured binding; 422 refused |

Every error body is `{ "message": string }`. `/admin/*` is for data stewards only, which needs auth (US-L.3).

`GET /` returns:

```json
{
  "service": "Data Binding Service",
  "description": "Owns the dictionary of data-bound fields and all access to the backing store. Consumers never talk to the store directly.",
  "anchors": ["client"],
  "strategies": ["attribute", "lookup"],
  "endpoints": { "GET /bindings?anchor=client": "Published bindings, as descriptors a form can render", "...": "one entry per endpoint above" }
}
```

OpenAPI 3.1 definition:

```yaml
openapi: 3.1.0
info:
  title: Data Binding Service
  version: 0.1.0
  description: >
    Owns the dictionary of data-bound fields and all access to the backing
    store. Consumers never talk to the store directly.
servers:
  - url: http://localhost:3100
paths:
  /bindings:
    get:
      summary: Published bindings
      parameters:
        - { name: anchor, in: query, required: false, schema: { $ref: '#/components/schemas/BindingAnchor' } }
      responses:
        '200': { description: Published descriptors, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/BindingDescriptor' } } } } }
  /bindings/{key}:
    get:
      summary: One binding's descriptor
      parameters: [ { $ref: '#/components/parameters/Key' } ]
      responses:
        '200': { description: Descriptor, content: { application/json: { schema: { $ref: '#/components/schemas/BindingDescriptor' } } } }
        '404': { $ref: '#/components/responses/Error' }
  /bindings/{key}/options:
    get:
      summary: A lookup binding's options, by code
      parameters: [ { $ref: '#/components/parameters/Key' } ]
      responses:
        '200': { description: Options, content: { application/json: { schema: { $ref: '#/components/schemas/BindingOptions' } } } }
        '404': { $ref: '#/components/responses/Error' }
  /anchors/client:
    get:
      summary: Find the client to anchor on
      parameters:
        - { name: clientNumber, in: query, required: true, schema: { type: string, minLength: 1 } }
      responses:
        '200': { description: Client, content: { application/json: { schema: { $ref: '#/components/schemas/ClientAnchor' } } } }
        '404': { $ref: '#/components/responses/Error' }
  /resolve:
    post:
      summary: Current values for bindings on an anchor
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/ResolveRequest' } } } }
      responses:
        '200': { description: Values, content: { application/json: { schema: { $ref: '#/components/schemas/ResolveResponse' } } } }
        '404': { $ref: '#/components/responses/Error' }
  /commit:
    post:
      summary: Write changed values; refuse to overwrite changes made since resolve
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CommitRequest' } } } }
      responses:
        '200': { description: Per-binding results, content: { application/json: { schema: { $ref: '#/components/schemas/CommitResponse' } } } }
        '404': { $ref: '#/components/responses/Error' }
  /admin/attributes:
    get:
      summary: Allow-listed attributes, with store limits and the DBS account's privileges
      parameters:
        - { name: anchor, in: query, required: false, schema: { $ref: '#/components/schemas/BindingAnchor' } }
      responses:
        '200': { description: Candidates, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/AttributeCandidate' } } } } }
  /admin/bindings:
    get:
      summary: Every binding and version, drafts included
      responses:
        '200': { description: Bindings, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/ManagedBinding' } } } } }
    post:
      summary: Create or replace a binding's draft
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateBindingRequest' } } } }
      responses:
        '200': { description: The binding, content: { application/json: { schema: { $ref: '#/components/schemas/ManagedBinding' } } } }
        '422': { $ref: '#/components/responses/Error' }
  /admin/bindings/{key}/publish:
    post:
      summary: Publish the draft as an immutable version
      parameters: [ { $ref: '#/components/parameters/Key' } ]
      responses:
        '200': { description: The binding, content: { application/json: { schema: { $ref: '#/components/schemas/ManagedBinding' } } } }
        '404': { $ref: '#/components/responses/Error' }
        '422': { $ref: '#/components/responses/Error' }
components:
  parameters:
    Key: { name: key, in: path, required: true, schema: { type: string }, example: client.title }
  responses:
    Error:
      description: Refused, with a message safe to show a user
      content: { application/json: { schema: { type: object, required: [message], properties: { message: { type: string } } } } }
  schemas:
    BindingAnchor: { type: string, enum: [client] }
    BindingStrategy: { type: string, enum: [attribute, lookup] }
    BindingPresentation: { type: string, enum: [text, dropdown, radio] }
    BindingControl:
      oneOf:
        - { type: object, required: [kind], properties: { kind: { const: text }, maxLength: { type: integer, minimum: 1 } } }
        - { type: object, required: [kind], properties: { kind: { const: lookup } } }
    BindingValidationRule:
      oneOf:
        - { type: object, required: [type, value], properties: { type: { const: maxLength }, value: { type: integer, minimum: 1 } } }
        - { type: object, required: [type], properties: { type: { const: oneOfOptions } } }
    BindingDescriptor:
      type: object
      required: [key, version, label, description, anchor, access, control, overridable]
      properties:
        key: { type: string }
        version: { type: integer, minimum: 1 }
        label: { type: string }
        description: { type: string }
        anchor: { $ref: '#/components/schemas/BindingAnchor' }
        access: { type: string, enum: [read, readWrite] }
        control: { $ref: '#/components/schemas/BindingControl' }
        overridable: { type: array, items: { type: string, enum: [label, required] } }
        presentations:
          type: object
          required: [allowed, default]
          properties:
            allowed: { type: array, minItems: 1, items: { $ref: '#/components/schemas/BindingPresentation' } }
            default: { $ref: '#/components/schemas/BindingPresentation' }
        options:
          type: object
          required: [href, allowBlank]
          properties: { href: { type: string }, allowBlank: { type: boolean } }
        validation:
          type: object
          required: [required, rules]
          properties:
            required: { type: boolean }
            rules: { type: array, items: { $ref: '#/components/schemas/BindingValidationRule' } }
        operations:
          type: object
          required: [resolve, commit]
          properties:
            resolve: { type: object, required: [href], properties: { href: { type: string } } }
            commit: { type: object, required: [href, strategy], properties: { href: { type: string }, strategy: { $ref: '#/components/schemas/BindingStrategy' } } }
    BindingOptions:
      type: object
      required: [options, source]
      properties:
        options: { type: array, items: { type: object, required: [value, label], properties: { value: { type: string }, label: { type: string } } } }
        source: { type: string, enum: [live, fallback, unavailable] }
    ClientAnchor:
      type: object
      required: [id, clientNumber, displayName]
      properties:
        id: { type: string, format: uuid }
        clientNumber: { type: [string, 'null'] }
        displayName: { type: string }
    AnchorContext:
      type: object
      required: [client]
      properties: { client: { type: string, format: uuid } }
    BoundValues:
      type: object
      additionalProperties: { type: [string, 'null'] }
    ResolveRequest:
      type: object
      required: [anchor, bindings]
      properties:
        anchor: { $ref: '#/components/schemas/AnchorContext' }
        bindings: { type: array, minItems: 1, items: { type: string } }
    ResolveResponse:
      type: object
      required: [values, resolvedAt]
      properties:
        values: { $ref: '#/components/schemas/BoundValues' }
        resolvedAt: { type: string, format: date-time }
    CommitRequest:
      type: object
      required: [anchor, values]
      properties:
        anchor: { $ref: '#/components/schemas/AnchorContext' }
        values: { $ref: '#/components/schemas/BoundValues' }
        baseline: { $ref: '#/components/schemas/BoundValues' }
    CommitResponse:
      type: object
      required: [results]
      properties:
        results:
          type: object
          additionalProperties:
            type: object
            required: [status]
            properties:
              status: { type: string, enum: [written, unchanged, conflict, readOnly, failed, skipped] }
              message: { type: string }
              current: { type: [string, 'null'] }
    AttributeCandidate:
      type: object
      required: [attribute, displayName, strategy, maxLength, storeRequired, lookupTarget, maxAccess, accessNotes, problems, boundBy, presentations]
      properties:
        attribute: { type: string }
        displayName: { type: string }
        strategy: { oneOf: [ { $ref: '#/components/schemas/BindingStrategy' }, { type: 'null' } ] }
        maxLength: { type: [integer, 'null'] }
        storeRequired: { type: boolean }
        lookupTarget: { type: [string, 'null'] }
        maxAccess: { type: string, enum: [read, readWrite] }
        accessNotes: { type: array, items: { type: string } }
        problems: { type: array, items: { type: string } }
        boundBy: { type: [string, 'null'] }
        presentations: { type: array, items: { $ref: '#/components/schemas/BindingPresentation' } }
    BindingVersion:
      type: object
      required: [version, status, descriptor, createdAt, publishedAt]
      properties:
        version: { type: integer, minimum: 1 }
        status: { type: string, enum: [draft, published] }
        descriptor: { $ref: '#/components/schemas/BindingDescriptor' }
        createdAt: { type: string, format: date-time }
        publishedAt: { type: [string, 'null'], format: date-time }
    ManagedBinding:
      type: object
      required: [key, origin, attribute, versions]
      properties:
        key: { type: string }
        origin: { type: string, enum: [code, configured] }
        attribute: { type: string }
        versions: { type: array, items: { $ref: '#/components/schemas/BindingVersion' } }
    CreateBindingRequest:
      type: object
      required: [key, label, attribute, access]
      properties:
        key: { type: string, pattern: '^client\.[a-z][A-Za-z0-9]{1,48}$' }
        label: { type: string, minLength: 1 }
        description: { type: string, default: '' }
        attribute: { type: string }
        access: { type: string, enum: [read, readWrite] }
        maxLength: { type: integer, minimum: 1 }
        presentations: { type: array, minItems: 1, items: { $ref: '#/components/schemas/BindingPresentation' } }
```

### C. form-builder's relay API

form-builder's server relays these endpoints to the DBS unchanged, so the browser only ever talks to its own server. Bodies and responses are as in B.

| form-builder endpoint | Relays to |
|---|---|
| `GET /api/bindings?anchor=` | `GET /bindings` |
| `GET /api/bindings/:key/options` | `GET /bindings/:key/options` |
| `GET /api/anchors/client?clientNumber=` | `GET /anchors/client` |
| `POST /api/bindings/resolve` | `POST /resolve` |
| `GET /api/binding-admin/attributes` | `GET /admin/attributes` |
| `GET /api/binding-admin/bindings` | `GET /admin/bindings` |
| `POST /api/binding-admin/bindings` | `POST /admin/bindings` |
| `POST /api/binding-admin/bindings/:key/publish` | `POST /admin/bindings/:key/publish` |

- The DBS's 404 and 422 pass through with their messages. Anything else, or an unreachable DBS, becomes **502** `{ "message": "The Data Binding Service is unavailable" }` (or the DBS's own message).
- `POST /commit` is **not** relayed; the server calls it itself after saving a submission (US-10.7).
- The DBS address is `BINDING_SERVICE_URL` (default `http://localhost:3100`).

### D. Store adapter interface

What every backing store implements inside the DBS. Store IDs and names appear only here and in the DBS's own tables, never in the API.

```ts
// Where a binding's value lives in a store. DBS-internal.
interface BindingSource {
  strategy: "attribute" | "lookup"
  entity: string          // e.g. "contact"
  attribute: string       // e.g. "csg_alias"
  target?: string         // lookups: the reference table, e.g. "csg_salutation"
}

type StoreValue = string | null   // text, or a lookup's STORE row ID

interface StoredRecord {
  values: Record<string /* attribute */, StoreValue>
  etag: string                    // row version, for conditional writes
}

interface Change { source: BindingSource; value: StoreValue }

interface AttributeMetadata {
  attribute: string
  displayName: string
  kind: "text" | "lookup" | "other"
  maxLength?: number
  requiredLevel: "none" | "recommended" | "required"
  updatable: boolean
  lookupTarget?: string
}

interface ServicePermissions {
  readEntity: boolean
  writeEntity: boolean
  appendEntity: boolean                   // needed to set a lookup
  readTargets: Record<string, boolean>     // per lookup target
  appendToTargets: Record<string, boolean> // per lookup target
}

interface ClientSummary {
  id: string                      // the STORE's record ID
  clientNumber: string | null
  firstName: string | null
  lastName: string | null
}

interface RecordStore {
  readonly name: string           // "icis", "fake", ...; keys identity refs
  findClientByNumber(clientNumber: string): Promise<ClientSummary | null> // null unless exactly one match
  read(entity: string, id: string, sources: BindingSource[]): Promise<StoredRecord | null>
  // One conditional update. Throws ConcurrentUpdateError if the row version
  // doesn't match, StoreWriteError (with a user-safe message) if refused.
  write(entity: string, id: string, changes: Change[], etag: string): Promise<void>
  lookupOptions(target: string): Promise<{ options: { value: string /* store row ID */; label: string }[]; source: "live" | "fallback" | "unavailable" }>
  describe(entity: string, attributes: string[]): Promise<AttributeMetadata[]>
  permissions(entity: string, targets: string[]): Promise<ServicePermissions>
}
```

**The Dataverse (ICIS) adapter's calls**, on Web API v9.2 with `Authorization: Bearer`, `OData-Version: 4.0`, `OData-MaxVersion: 4.0` and `Accept: application/json`:

| Operation | Dataverse call |
|---|---|
| Find client | `GET contacts?$select=contactid,csg_clientid,firstname,lastname&$filter=csg_clientid eq '<digits>'&$top=2` (a second match means ambiguous, so null) |
| Read | `GET <entitySet>(<id>)?$select=<attr>,_<lookup>_value,…`; the version is `@odata.etag` |
| Write | `PATCH <entitySet>(<id>)` with `If-Match: <etag>`, body `{ "<attr>": value, "<nav>@odata.bind": "/<targetSet>(<rowId>)" }`. 412 means a concurrent change. |
| Clear a lookup | `DELETE <entitySet>(<id>)/<nav>/$ref` |
| Options | `GET <targetSet>?$select=<primaryId>,<primaryName>&$filter=statecode eq 0&$orderby=<primaryName>`; 403 means `unavailable` (the salutation list alone falls back) |
| Entity info | `GET EntityDefinitions(LogicalName='<e>')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,Privileges` |
| Lookup navigation property | `GET EntityDefinitions(LogicalName='contact')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName&$filter=ReferencingAttribute eq '<attr>'` |
| Attribute metadata | `GET EntityDefinitions(LogicalName='contact')/Attributes?$select=LogicalName,AttributeType,DisplayName,RequiredLevel,IsValidForUpdate&$filter=LogicalName eq '<a>' or …`, plus `…/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=LogicalName,MaxLength` and `…/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets` |
| Own privileges | `GET WhoAmI`, then `GET systemusers(<UserId>)/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`; compare `RolePrivileges[].PrivilegeName` with each entity's `Privileges` |

Privilege errors (`… is missing <prvName> privilege …`) are reported as "ICIS refused the update: the Data Binding Service's account is missing `<prvName>` privilege", with principal IDs stripped.

### E. Database schemas

#### E.1 The DBS's own database

Postgres, in a separate database (`binding_service`), never form-builder's.

```sql
-- DBS-issued client identities, and the record each is in each store.
CREATE TABLE anchors (
  id         uuid PRIMARY KEY,
  anchor     text NOT NULL,                       -- 'client'
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE anchor_refs (
  anchor_id  uuid NOT NULL REFERENCES anchors(id) ON DELETE RESTRICT,
  store      text NOT NULL,                       -- 'icis', ...
  store_id   text NOT NULL,                       -- the store's record ID
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anchor_id, store)
);
CREATE UNIQUE INDEX anchor_refs_store_record ON anchor_refs (store, store_id);

-- Logical option codes per lookup list, and each store's row per code.
CREATE TABLE option_codes (
  target     text NOT NULL,                       -- e.g. 'csg_salutation'
  code       text NOT NULL,                       -- e.g. 'mr'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target, code)
);
CREATE TABLE option_code_refs (
  target     text NOT NULL,
  code       text NOT NULL,
  store      text NOT NULL,
  store_id   text NOT NULL,                       -- the store's row ID
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target, code, store),
  FOREIGN KEY (target, code) REFERENCES option_codes (target, code) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX option_code_refs_store_row ON option_code_refs (target, store, store_id);

-- Bindings stewards create (built-in ones are code), and every version.
CREATE TABLE configured_bindings (
  key        text PRIMARY KEY,                    -- 'client.preferredName'
  strategy   text NOT NULL,                       -- 'attribute' | 'lookup'
  entity     text NOT NULL,
  attribute  text NOT NULL,
  target     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX configured_bindings_attribute ON configured_bindings (entity, attribute);

CREATE TABLE binding_versions (
  key          text NOT NULL REFERENCES configured_bindings(key) ON DELETE RESTRICT,
  version      integer NOT NULL,
  status       text NOT NULL,                     -- 'draft' | 'published'
  descriptor   jsonb NOT NULL,                    -- a BindingDescriptor (A.1)
  created_at   timestamptz NOT NULL,
  published_at timestamptz,
  PRIMARY KEY (key, version)
);
CREATE UNIQUE INDEX binding_versions_one_draft ON binding_versions (key) WHERE status = 'draft';

-- Published versions are immutable, even to hand-run SQL.
CREATE FUNCTION forbid_published_binding_version_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'binding % version % is published and cannot be changed', OLD.key, OLD.version
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER binding_versions_published_are_immutable
  BEFORE UPDATE OR DELETE ON binding_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_published_binding_version_change();
```

**Concurrency.** Issuing an anchor or a code runs in a transaction that first takes `pg_advisory_xact_lock(hashtext(...))`:
- for an anchor, keyed on `'anchor:<store>:<store_id>'`;
- for a code, on `'options:<target>'`.

The transaction then reads and, if needed, inserts. The unique indexes back this up.

**Saving a binding:**
1. Insert `configured_bindings`, or do nothing if the key exists. A different source for an existing key, or a unique violation on `configured_bindings_attribute`, is refused.
2. Upsert each version on `(key, version)`, but **only update rows whose `status = 'draft'`**.

#### E.2 form-builder's database: one new table

```sql
-- Each attempt to send a submission's bound values to the DBS.
CREATE TABLE submission_bindings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  anchor        jsonb,            -- AnchorContext, or null if no client was chosen
  baseline      jsonb,            -- BoundValues resolved when the form opened
  "values"      jsonb NOT NULL,   -- BoundValues sent
  results       jsonb NOT NULL,   -- Record<key, BindingCommitResult>
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submission_bindings_submission_id ON submission_bindings (submission_id);
```

Form definitions need no schema change: a `bound` field (A.5) is stored in the existing `form_versions.schema` jsonb, with its descriptor snapshot.

### F. Built-in bindings and the allow-list

**Built-in bindings** (code, published as version 1):

| Key | Label | Access | Control | Store source (ICIS) |
|---|---|---|---|---|
| `client.title` | Title | readWrite | lookup | `contact.csg_salutationid` → `csg_salutation` |
| `client.firstName` | First name | readWrite | text, max 50 | `contact.firstname` |
| `client.lastName` | Last name | readWrite | text, max 50 | `contact.lastname` |
| `client.clientNumber` | Client number | read | text | `contact.csg_clientid` |

**The allow-list** for the `client` anchor, on ICIS entity `contact`:

| Attribute | ICIS label | Type (ICIS) | Max access |
|---|---|---|---|
| `csg_salutationid` | Title | lookup → `csg_salutation` | readWrite |
| `firstname` | First Name | text 50 | readWrite |
| `middlename` | Middle Name | text 50 | readWrite |
| `lastname` | Last Name | text 50 | readWrite |
| `csg_alias` | Preferred Name | text 100 | readWrite |
| `rawa_preferredgender` | Preferred Gender Term | text 100 | readWrite |
| `csg_genderid` | Gender | lookup → `csg_gender` | readWrite |
| `csg_home_languageid` | Home Language | lookup → `csg_language` | readWrite |
| `mobilephone` | Mobile Phone | text 50 | readWrite |
| `telephone2` | Home Phone | text 50 | readWrite |
| `emailaddress1` | Email | text 100 | readWrite |
| `csg_clientid` | Contact ID (client number) | text 100 | **read** |

**Deliberately excluded**, although ICIS would let a binding update them:
- `adx_identity_*` (portal credentials);
- `csg_dssid` (the DEX client ID);
- `csg_health_care_card_id`, `csg_pension_card_id` and `csg_fahcsiaid` (government identifiers);
- `csg_slk*` (statistical linkage keys);
- anything carrying FDR case content (§17).

### G. Mock ICIS API subset

The mock serves exactly the calls in D's Dataverse table, under `/api/data/v9.2/`, for entities `contact`, `csg_salutation`, `csg_gender`, `csg_language` and `systemuser`.
- It accepts only `Authorization: Bearer mock-icis-demo-token`; anything else is 401.
- It enforces the service account's privileges on each call, with Dataverse's 403 message format.
- It returns 412 on an `If-Match` mismatch, and 400 on a text value over its maximum length.
- Anything outside the subset returns 400 "The mock ICIS doesn't support …".

Its screens:

| Screen | Path | Does |
|---|---|---|
| Clients | `GET /clients`, `GET /clients/:id`, `POST /clients/:id` | List and search; view every column; save as ICIS staff, which bumps the row version |
| Service account | `GET /service-account`, `POST /service-account` | Tick or untick the DBS account's privileges (Read/Write/Append on Contact; Read/Append To on each list; Read on User) |
| API log | `GET /api-log` | Every Web API call, newest first |
| Reset | `POST /reset` | Restore the seed data, privileges and log |

The seed privileges are `prvReadContact`, `prvReadCsg_salutation` and `prvReadUser`, mirroring the real test account.

### H. Messages

Shown to users verbatim. Keep the wording consistent.

**Commit results** (`message`):

| Situation | Message |
|---|---|
| Changed in the store since resolve | "Changed in the source system since this form was opened" |
| Too long | "Longer than the N characters this field allows" |
| Not an allowed option | "Not one of the allowed options" |
| Options couldn't be read | "Couldn't check the value against the list of options" |
| Clearing a store-required value | "A value is required here" |
| Row changed between read and write | "The record changed while it was being saved" |
| Store refused (privilege) | "ICIS refused the update: the Data Binding Service's account is missing `<privilege>` privilege" |
| DBS unreachable (form-builder) | "The Data Binding Service is unavailable" |
| No client chosen (form-builder) | "No client was selected, so nothing was sent" |

**Binding creator refusals** (422 `message`):
- "A binding key is 'client.' followed by a camelCase name, e.g. client.preferredName."
- "`<key>` is a built-in binding and can't be changed here."
- "`<attribute>` isn't on the allow-list."
- "`<attribute>` is already bound as `<key>`."
- "`<key>` is already bound to `<attribute>`; a binding's attribute can't change."
- "This binding can only be display-only: `<reasons>`"
- "ICIS allows at most N characters here; a binding can only narrow that."
- "A list binding can't be shown as `<presentation>`."
- "`<key>` has no draft to publish."
- The publish-time problems from A.4 ("The Data Binding Service's ICIS account can't read the `<target>` list, so its options can't be shown.").
