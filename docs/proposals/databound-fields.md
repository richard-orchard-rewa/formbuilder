# Proposal: Data-Bound Fields & the Data Binding Service

## Status

Exploratory concept proposal, not an ADR. Derived from `Form_Builder_Requirements_v1.1_1.docx` (17 September 2026, §7 "Data Binding", plus §3, §5, §8 and §20 where they constrain it), and from a read of how the sibling `feedback` app talks to ICIS (reference only — per [CLAUDE.md](../../CLAUDE.md), nothing here depends on or shares code with that repo).

**Phase 0 (the prototype) is built** — see "Phase 0 — what was built" below. Everything after it is still proposal. For where the work got to and what's next, see the [handover](../handover/databound-fields.md).

This supersedes the "entity-linked / data bound fields … out of scope" line in [modules-and-session-templates.md](modules-and-session-templates.md) — that proposal deferred the idea; this one designs it.

## The idea in one paragraph

A **data-bound field** is a form control whose value is read from, and/or written to, a record in another datastore — today ICIS (Dynamics 365 / Dataverse), later the new Session Notes database. Form-builder never talks to that datastore directly. It talks to a **Data Binding Service (DBS)**: a self-describing API that publishes a *dictionary* of bindable fields (what control to render, which properties are locked, where options come from, which module types may use it) and executes reads and writes against the backing store. Everything ICIS-specific lives behind the DBS, so swapping ICIS for the new database later changes the DBS, not form-builder.

## Why an API, not direct ICIS calls

- **Requirements §7 asks for it explicitly**: bound fields map to the database "via an api to create an abstraction for easily modification in the future", and the dictionary "could be an API (self documented): GET describes … the fixed or default control properties, POST contains the methods for saving the data".
- **The strangler path.** ICIS is the current store, but Part B of the requirements describes a new client/case/session skeleton that replaces it. If form-builder speaks OData to `contacts` and `wp_sessions`, every form built between now and then has to be reworked. If it speaks to `client.firstName`, only the DBS adapter moves.
- **Anti-corruption boundary.** ICIS has sharp edges that shouldn't leak into a generic form builder: `@odata.bind` lookup syntax, IDs returned in the `OData-EntityId` header, hard-coded option-set integers, plugin business-rule errors surfaced as `0x80040265` message text, DEX timing (data written after a `wp_session` is Completed misses the funder export). `feedback`'s own ADR-021 reaches the same conclusion — its ICIS sync adapter *is* its anti-corruption layer.
- **One place for referential integrity.** §7's hard cases (a referral that belongs to one session participant; presenting needs as a many-to-many set) are write *strategies*, not field shapes. The DBS owns the strategy; form-builder only needs to know the shape of the value.

## Concepts

| Term | Meaning |
|---|---|
| **Binding** | One entry in the dictionary, e.g. `client.firstName`. Stable key, versioned (`client.firstName@1`). |
| **Anchor** | The record a module is "about" — `client`, `case`, `session`, `sessionParticipant`. §7: "a module type will be anchored to a core table". A binding declares which anchors it can be used from and how it relates to them. |
| **Descriptor** | What `GET /bindings/{key}` returns: everything form-builder needs to render, lock and validate the control. |
| **Resolve** | Read current values for a set of bindings, given anchor context. |
| **Commit** | Write values for a set of bindings, given anchor context. |
| **Adapter** | The DBS's implementation against one backing store (ICIS now; a fake for tests; the new DB later). |

## The DBS contract (proposed)

This is the target shape. The prototype implements a deliberately smaller subset — the shipped contract is [`shared/src/schemas/binding.ts`](../../shared/src/schemas/binding.ts), and the differences are listed under "Phase 0 — what was built".

### Dictionary — build time

```
GET /bindings?anchor=client            → BindingSummary[]
GET /bindings/{key}                    → BindingDescriptor (latest version)
GET /bindings/{key}/versions/{n}       → BindingDescriptor (pinned)
GET /bindings/{key}/options?filter=…   → { value, label }[]   (lookups/choices only)
```

A descriptor is designed to drop straight into form-builder's existing JSON Schema → JSON Forms pipeline ([ADR-0003](../adr/0003-json-schema-renderer.md), [ADR-0005](../adr/0005-zod-to-json-schema.md)), so a bound field renders through exactly the same renderer as every other field:

```jsonc
{
  "key": "client.title",
  "version": 1,
  "label": "Title",                       // default; builder may override
  "anchors": ["client"],                  // where it may be used
  "access": "readWrite",                  // "read" | "readWrite"
  "valueShape": "scalar",                 // "scalar" | "set" | "collection"
  "control": {
    "fieldType": "dropdown",              // one of form-builder's FieldType values
    "jsonSchema": { "type": "string", "maxLength": 100 },
    "optionsSource": "/bindings/client.title/options"  // omitted when static/none
  },
  "locked": ["fieldType", "jsonSchema", "optionsSource"],
  "overridable": ["label", "helpText", "required", "placeholder"],
  "validationType": null                  // name from the maintained library (§3), when there is one
}
```

`locked` vs `overridable` is §7's "the data type, associated control etc and many of the properties of the control will be locked down (defined in the dictionary)" made concrete. The dictionary itself is **developer-maintained code in the DBS**, not admin-editable data — §7 says the integrity rules are "defined and maintained by the developer and not editable for the form builder".

### Runtime — fill time

```
POST /resolve
{ "anchor": { "client": "<contactId>" },
  "bindings": ["client.title@1", "client.firstName@1", "client.lastName@1"] }
→ { "values": { "client.firstName@1": "Alex", … },
    "etag": "<row version>",               // for optimistic concurrency on commit
    "resolvedAt": "2026-09-25T02:14:00Z" }

POST /commit
{ "anchor": { "client": "<contactId>" },
  "values": { "client.firstName@1": "Alexandra" },
  "baseEtag": "<etag from resolve>",
  "idempotencyKey": "<submissionId>:<attempt>" }
→ { "results": { "client.firstName@1": { "status": "written" } }, "etag": "<new>" }
  | 409 { "conflicts": { "client.firstName@1": { "current": "Alex J." } } }
```

`baseEtag` gives the §4/§8 rule "a save never overwrites a version it was not based on" at the ICIS boundary too — Dataverse supports this natively with `If-Match` on its `@odata.etag`.

## What changes in form-builder

1. **A new field variant** in [field.ts](../../shared/src/schemas/field.ts)'s discriminated union:
   ```ts
   { type: "bound", id, bindingKey: "client.title", bindingVersion: 1,
     descriptor: BindingDescriptor,          // snapshotted at add time
     overrides: { label?, helpText?, required? } }
   ```
   Snapshotting the descriptor into the module/form version keeps published versions immutable (ADR-0004) and means a historical submission renders even if the DBS later drops or revs that binding. Changing a field's binding or binding version is a **conflicting** change per §5.
2. **Modules/forms gain an `anchor`**, and the palette only offers bindings whose `anchors` include it.
3. **Fill-time context.** Filling a form needs the anchor ID(s) — for the prototype a `?client=<contactId>` parameter; in the real system the embedding session-notes app supplies it (§9, [embeddable-component.md](embeddable-component.md)).
4. **`toJsonSchema` learns `bound`** — it emits the descriptor's `jsonSchema` (with `readOnly: true` when `access: "read"`) and any override label. Dynamic options are fetched when the form is opened and **snapshotted onto the submission** (§20 "dynamic dropdown drift").
5. **Submission write path** — the raw JSON submission stays the system of record for *what was captured* (§7 "Form Submission vs Data-bound Data Storage"); bound values are then committed to the DBS. Each submission records, per bound field, the value resolved at open, the value committed, and the commit outcome.

## Decisions to make (with a suggested answer)

1. **Pinned vs live on re-render.** §7 says re-rendering "will preference the database records if there has been a subsequent update"; §8 and §20 say read-only referenced values are "resolved and stored at finalisation" so history doesn't silently rewrite. *Suggest:* read-only bindings are pinned, always. Writable bindings render the submission's value with a visible "changed in ICIS since — [current value]" indicator, rather than silently swapping it.
2. **When commits happen.** On finalise only, or on every draft save? *Suggest:* finalise only — drafts are allowed to be incomplete and wrong (§8), and pushing half-typed names into ICIS is worse than a delay.
3. **Synchronous or outbox.** *Suggest:* synchronous for the prototype (simplest to see working); outbox + retry (the pattern `feedback` already proves) before anything real, because a DBS or ICIS outage must not stop a practitioner finalising a note.
4. **Identity.** §8 prohibits a service principal asserting the user for clinical writes, which rules out plain client credentials *and* Dataverse's `CallerObjectId` impersonation for the real thing. *Suggest:* the prototype uses a service identity (clearly labelled as non-compliant), and on-behalf-of delegated tokens are designed in once form-builder has Entra sign-in.
5. **Where the DBS lives.** *Suggest:* a separate deployable with its own contract. For the prototype, a fifth workspace package in this repo is fine as long as form-builder only reaches it over HTTP — easy to lift into its own repo later.

## Phase 0 — what was built (2026-09-25)

Goal: prove the whole loop in one sitting. An admin drags "First name" from a *Data bound* palette section onto a form and publishes it. Someone opens it for a real test-ICIS contact, sees the current values pre-filled, edits them, submits, and sees what happened to each value in ICIS.

**Why these fields:** the anchor is trivial (`client` → one `contact` row, no relationship resolution), they exercise both read (prefill) and write (PATCH), and *Title* turned out to be a lookup, so the options path is proven too. They sit in the §13 "structural client fields" the real design would *not* let a form edit. That's fine for a prototype, but a production pilot should pick session-level fields instead.

### Run it

```bash
npm run dev    # binding-service on :3100, server on :3000, client on :5173
```

`binding-service/.env` (copy `.env.sample`) picks the adapter:
- `ADAPTER=fake` serves an in-memory store seeded with a stand-in for Bob McGee (client number `00152076`).
- `ADAPTER=icis` talks to test ICIS.

If the DBS isn't running, the palette says so, and forms without bound fields are unaffected.

Demo: build a form, drag *Title*, *First name*, *Last name* and *Client number* from **Data bound · Client**, publish, open *Fill out*, and load client `00152076`.

### What exists

- **`binding-service/`**, a fifth workspace. It's a Fastify app, and form-builder reaches it only over HTTP.
  - [`dictionary.ts`](../../binding-service/src/dictionary.ts) holds four bindings:
    - `client.title` (lookup)
    - `client.firstName` and `client.lastName` (text, max 50, matching ICIS)
    - `client.clientNumber` (read-only, added to prove the display-only path)
  - [`service.ts`](../../binding-service/src/service.ts) does resolve and commit. A commit writes only what changed, in one conditional update. Read-only bindings are ignored.
  - [`adapters/icis.ts`](../../binding-service/src/adapters/icis.ts) is the only code that knows ICIS column names and OData syntax. It uses plain `fetch` + MSAL, with no client library, because the surface is one read, one PATCH and one list.
  - [`adapters/fake.ts`](../../binding-service/src/adapters/fake.ts) is for dev, unit tests and e2e.
  - Endpoints:
    - `GET /bindings[?anchor=]`, `GET /bindings/:key`, `GET /bindings/:key/options`
    - `GET /anchors/client?clientNumber=`
    - `POST /resolve`, `POST /commit`
- **`shared`**:
  - The DBS contract ([`binding.ts`](../../shared/src/schemas/binding.ts)).
  - A `bound` field variant that snapshots the descriptor.
  - `toJsonSchema(fields, { bindingOptions })`, which renders bound fields through the same pipeline as every other field. Read-only bindings become `readOnly` and are never required.
- **form-builder server** ([`modules/bindings/`](../../server/src/modules/bindings/)):
  - Proxy routes (`/api/bindings`, `/api/bindings/:key/options`, `/api/anchors/client`, `/api/bindings/resolve`), so the browser only talks to its own server.
  - `BoundFieldsService`, called from `SubmissionsService.submit` *after* the submission is saved. It commits the writable bound values and records the attempt in a new `submission_bindings` table (anchor, baseline, values sent, per-binding result).
  - An unreachable DBS or a refused write is reported per field. It never fails the submission.
- **form-builder client**:
  - The palette lists the dictionary.
  - The inspector shows what's fixed by the binding and disables *Required* where the dictionary doesn't allow it.
  - The fill page has a client picker (by ICIS client number). Loading a client resolves the bound values.
  - After submit, the fill page shows per-field outcomes: *Saved to ICIS* / *Unchanged* / *Not saved — changed in ICIS since the form was opened* / *Not saved — {reason}* / *Not sent*.

**Conflict handling as built.** The fill page sends the values it resolved on open (`baseline`) along with the new values. The DBS re-reads the record and handles each binding in turn:
- If the new value equals the current one, it's *unchanged*.
- If the store's value no longer matches the baseline, it's a *conflict*, reported with the store's current value. The DBS doesn't overwrite it.
- Otherwise the new value is queued for writing.

The queued values go in one PATCH with `If-Match` on the row version it just read, so a change landing between that read and the write fails the write instead of half-applying it.

**Differences from the proposed contract above.** These are simplifications, not decisions:
- Bindings are referenced by key alone, with no `@version`.
- `control` is `{kind: "text", maxLength?} | {kind: "lookup"}`, not an embedded JSON Schema fragment. `shared` builds the schema.
- `overridable` covers only `label` and `required`.
- There's no `valueShape` (everything is scalar) and no `etag` in resolve responses (the baseline values are used instead).

### What the prototype found in test ICIS

- **Title is a lookup, not text.** It's `contact.csg_salutationid` → the `csg_salutation` table (`csg_name`), not the standard free-text `salutation` (which is empty on the contacts checked). Writing it takes `csg_salutationid@odata.bind`, and clearing it takes `DELETE …/csg_salutationid/$ref`.
- **The client number is `contact.csg_clientid`.** Contact 00152076 (Bob McGee) is `2c616f0e-d741-f011-8779-000d3ad0ea14`.
- **The app identity can read but not write contacts.** The prototype borrows `feedback`'s test app registration (`rawa-feedback-stg`) for now, by agreement. That identity:
  - has Read/Append/AppendTo on contacts but **not Write** (`prvWriteContact`), so every real write is refused and reported as *Not saved*;
  - **can't read `csg_salutation`** (`prvReadCsg_salutation`), so the DBS serves the five salutations observed on contacts (Miss/Mr/Mrs/Ms/Not Stated) as a flagged `fallback` list.

  Verified end to end: live reads and prefill work. The write path is proven against the fake store, including a conflict. Against ICIS, the write reaches Dataverse and comes back as a clean privilege error with principal IDs stripped.
- **Next step to see a real write land in ICIS:** a dedicated DBS app registration and application user in test ICIS, with Read/Write on `contact` and Read on `csg_salutation`. Setup steps: [docs/setup/icis-binding-service-account.md](../setup/icis-binding-service-account.md). That also stops form-builder borrowing `feedback`'s identity, which CLAUDE.md's standalone rule wants gone before this goes further.

### Still out of the prototype

- On-behalf-of identity and the §8 audit trail. The DBS uses client credentials, which §8 prohibits for real clinical writes.
- Outbox/retry. The commit is synchronous on submit.
- Bound fields in **modules / session templates**. The palette section is only wired into the form builder.
- Restoring the chosen client when a draft is resumed.
- Participant-level and many-to-many bindings.
- DEX timing rules.
- Binding-version migration beyond "same key carries over".
- The "changed in ICIS since" indicator when re-viewing a submission (decision 1).

## Creating bindings without a developer

Phase 0's dictionary is code, so every new bound field needs a developer. That doesn't scale: most requests will be "let this form show/edit the client's X". The answer is to split what a developer must write from what a data steward can configure.

### Strategies are code; bindings are configuration

How a value is written varies little across bindings. Developers write a small, fixed set of **write strategies** once:

| Strategy | What it does | Example bindings |
|---|---|---|
| `attribute` | One text value on the anchor record | Preferred name, mobile phone, email |
| `lookup` | One reference-table ID on the anchor record | Title, gender, home language |
| `set-membership` | A set of library items linked to the anchor via a junction table (§7 example 2) | Presenting needs, risk factors |
| `child-collection` | Child records per participant, re-presented when the session is edited (§7 example 1) | Referrals |

A **binding** is a strategy plus configuration: which allow-listed attribute or tables, a label, read-only or writable, narrower limits. A steward creates bindings in the DBS; no developer is involved unless a new *strategy* is needed. §7's "developer-maintained rules for referential integrity" live in the strategies, where they belong. The doc's own suggestion ("a function that takes in the library table and the many-to-many table") is exactly the `set-membership` strategy.

### Who defines what

| Owned by | What | Why |
|---|---|---|
| **Store metadata**, read, never typed in | Data type, max length, store-required level, lookup target | ICIS already knows; retyping it is how the two drift apart |
| **The binding**, created in the DBS | Logical key, label, read-only vs writable, narrower limits, validation type (§3 library), allowed anchors | These are properties of the *concept*, the same on every form (§6) |
| **The form control** | Audience wording, validation severity (assist/warn/block), required-on-this-form | §3 and §6: severity and wording vary by audience, so they belong to the control on a given form |

A binding can only **narrow** what the store allows: a shorter max length, a stricter validation type, read-only instead of writable. It never widens past what ICIS accepts, and a form control never loosens its binding.

### Guardrails

1. **An allow-list of attributes per anchor.** This is approved by a data owner and kept as code, and it's the real security boundary. A probe of test ICIS shows why it can't be skipped: `contact`'s *updatable* attributes include `adx_identity_passwordhash` and `adx_identity_securitystamp` (portal credentials), `csg_dssid` (the DEX client ID), and `csg_health_care_card_id` / `csg_pension_card_id`. None of those should ever be one click from a form. FDR content (§17), DEX-reported fields (locked modules, §4) and §13 structural identity fields stay off the list or read-only.
2. **The service account is the ceiling.** The DBS checks its own privileges in the store (Dataverse `RetrieveUserPrivileges`). If it can't write the entity, it won't offer "writable". If it can't read a lookup's reference table, a lookup binding can't be published, because it would render with no options. The creator shows *why*, rather than failing at first submit.
3. **Versioned and immutable once published**, like modules. Editing a published binding creates a new draft version. Forms keep the descriptor snapshot they were built with, and narrowing is a *conflicting* change for them (§5).
4. **Logical keys, not store names.** Forms reference `client.preferredName`. The mapping to `contact.csg_alias` lives only in the DBS, so replacing ICIS means remapping bindings, not rewriting forms.
5. **A steward role, not the form builder.** Creating bindings requires knowing what the field means and who reports on it. That's a different person from the one assembling modules, and it will need its own permission once auth exists.

### Phase 0.5 — binding creator slice

The `attribute` and `lookup` strategies only, `client` anchor only:

- An allow-list of `contact` attributes, with the Phase 0 code bindings unchanged alongside.
- `GET /admin/attributes?anchor=client`: each allow-listed attribute with its live store metadata (type, max length, required level, lookup target), what the service account can do with it, and whether a binding already uses it.
- `POST /admin/bindings` to create a draft. The strategy and limits are derived from metadata; the request can only narrow them. `POST /admin/bindings/:key/publish` makes it an immutable version.
- Configured bindings are stored by the DBS itself, not in form-builder's database. For the prototype that's a JSON file, which keeps `ADAPTER=fake` zero-setup.
- A "Data bindings" admin page in form-builder (relayed through its server like the rest) to browse attributes, create, and publish. A published binding appears in the form palette with no other change.

Out of this slice: the `set-membership` and `child-collection` strategies, the validation-type library, retiring bindings, and steward permissions.

**Built (2026-09-25).** Open **Data bindings** from the app's nav.

- **Code layout.**
  - The allow-list is [`binding-service/src/allow-list.ts`](../../binding-service/src/allow-list.ts): 12 `contact` attributes, with `csg_clientid` capped at display-only.
  - The rules live in [`creator.ts`](../../binding-service/src/creator.ts).
  - Code and configured bindings are merged in [`registry.ts`](../../binding-service/src/registry.ts). Forms only see a binding's latest *published* version.
  - The built-in Phase 0 bindings now share the same `strategy + source attribute` shape, and runtime reads and writes go through one generic path.
- **Enforcement.**
  - Commits re-check a text binding's max length at the API boundary.
  - Configured bindings are stored in `binding-service/data/bindings.<adapter>.json`, which is gitignored.
- **Verified against test ICIS.**
  - Live metadata comes back per attribute, e.g. `csg_alias` = "Preferred Name", text, 100.
  - The live privilege check works. The borrowed account lacks `prvWriteContact`, so *every* attribute is capped at display-only, and the page says so once, as a banner.
  - A **Preferred name** binding (`client.preferredName` → `csg_alias`, display-only, narrowed to 60) was created, published, and appeared in the form palette with no other change. It resolved on the fill page for Bob McGee; ICIS holds no preferred name for him, so it renders empty.
  - A **Gender** lookup draft was **refused at publish**, because the account can't read `csg_gender`.
  - An attempt on `adx_identity_passwordhash` was refused as not allow-listed.
- **Found:** in test ICIS the borrowed account can read *none* of the custom reference tables behind `contact`'s lookups (gender, language, country, state, suburb, …). So no configured lookup can publish until the DBS has its own account.

## Phase 1 and beyond (sketch)

- Session-anchored, read-only bindings from the booking (§8 "values pulled from other records … resolved and stored at finalisation") — likely the first *production* use.
- `set` write shape for presenting needs (§7 example 2) and `collection` for referrals (§7 example 1), with participant-scoped module types.
- Outbox + retry; commit failure surfaced on the submission.
- OBO delegated identity; per-write actor type and provenance (§8).
- Options snapshotting and change logging for dynamic lookups (§20).
- A second adapter against the new Session Notes database — the real test of the abstraction.
