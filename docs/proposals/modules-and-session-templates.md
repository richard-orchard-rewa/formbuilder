# Proposal: Modules & Session Templates

## Status

Exploratory concept proposal, not an ADR. Derived from `Form_Builder_Design_Brief_1.docx` and the annotated `Session_Notes_Potential_UX_annotated.drawio` wireframes, both supplied 2026-09-21. Scoped down for a fast, demonstrable MVP — see "Scope decisions" below. Nothing here has been built or scheduled; it's a set of candidate user stories for review before any become GitHub issues.

## Why this is scoped down from the source brief

The design brief describes form-builder as *"a component inside a session notes system"* — with clients, cases, participants, funder (DEX) reporting, entity-linked "data-bound" fields, roles and approval workflows. That's a different, much larger system than what exists here today: this repo is a **standalone, domain-agnostic** form builder (per [CLAUDE.md](../../CLAUDE.md)) with no client/case/entity model at all (confirmed in [field.ts](../../shared/src/schemas/field.ts) — fields are flat, no concept of a data source beyond what's typed into the builder).

Building the full brief would mean building that session-notes system first. Instead, this proposal takes just the reusable-building-block idea — modules and session templates — and keeps it domain-agnostic, so it can be demonstrated quickly on top of what already exists. Entity-linked fields, funder/DEX logic, roles and approval gates are explicitly **out of scope** here; they're noted as future epics informed by the brief, not designed in this document.

## Scope decisions (confirmed 2026-09-21)

1. **Domain-agnostic modules** — a module is a named, reusable group of fields, using the same field type registry forms already use. No entity model, no "data bound" fields yet.
2. **Live reference, not copy-in** — a session template stores *references* to modules, not copies of their fields. Editing a module can affect templates that use it, rather than each template getting a frozen copy at the moment it was added.
3. **Session Template is a new top-level concept** — its own entity, list, and builder, distinct from `Form`. It is not "a Form assembled differently."
4. **One instance of a module per template** — a module can be added to a given session template at most once. Repeating a module (e.g. one "Attendance" block per participant) needs a participant/entity model that doesn't exist yet, so it's deferred rather than designed around now.
5. **Session templates get version history in Phase 1** — the timeline/past-version pattern forms already have (US-6.1–6.4) is built for session templates from the start, not retrofitted later.
6. **Flat navigation** — Modules and Session Templates get their own top-level nav items alongside the existing Forms list. No new "Form Administration" shell; the drawio's four-way split (which anticipates the blocked client-facing surface) is deferred.

Decision 2 is the one with the most teeth: the brief's full version of it needs impact analysis, an "affected forms" banner, and an approval gate (§3.2, §3.4) before it's safe to ship. This proposal reconciles "live reference" with "quick to demonstrate" the same way this codebase already reconciles editability with stability for forms (ADR-0004: *a form version is immutable once published*):

- A module's **draft** can be edited freely.
- Publishing a module creates an immutable **module version** — exactly like `FormVersion` today.
- A session template's **draft** always assembles the *current published version* of each module it references — so improving a module updates every draft template that uses it, with no extra plumbing.
- Publishing a session template snapshots which module version each reference pointed to *at that moment* into an immutable **session template version** — so a template someone has already started filling out never shifts under them, matching the guarantee submissions already get from forms.

That gets the "propagation" behaviour the brief wants at draft time, without needing the impact-analysis/approval machinery yet — that's Phase 2 below, and is now a much smaller addition on top of a working concept instead of a precondition for one.

## Concept summary

- **Module** — a named, reusable, versioned group of fields. Built and published the same way a form is today (draft → published version), but consumed by session templates rather than filled out directly.
- **Session Template** — a new top-level entity: a named, ordered list of module references. Publishing one snapshots the module versions it uses. A published session template version can be filled out, producing a submission — the same respondent experience forms already provide, assembled from modules instead of individual fields.

## Phase 1 — MVP: prove the concept end-to-end

Goal: an admin can build a couple of modules, assemble them into a session template, publish it, and fill it out — the whole loop, demonstrable in one sitting. New epics **US-7** (Modules) and **US-8** (Session Templates); epics 0–6 are already in use.

### Epic US-7 — Modules

**US-7.1 — Create a module**
- Name (required, free text) and description (optional, free text), mirroring `CreateFormSchema`.
- Saved as a draft; appears immediately in the modules list.

**US-7.2 — Build a module's fields**
- Reuses the existing form canvas/palette/inspector UX (`FieldPalette`, `FormCanvas`, `FieldInspector`) against a module's draft instead of a form's.
- All existing field types (text, textarea, dropdown, checkbox, radio, date, number) available; add, edit, reorder, remove.

**US-7.3 — Publish a module**
- Publishing a draft creates an immutable module version (mirrors `FormVersion` / ADR-0004) and marks it current.
- Further edits start a new draft; the previously published version is untouched.

**US-7.4 — Modules library**
- New top-level nav item alongside Forms; lists non-archived modules on load; search is substring, case-insensitive, trimmed, with a "no matches" state (matching the forms list today).
- Shows draft/published state per module.
- Archive hides a module from the picker in US-8.2 without deleting it or affecting templates that already reference it.

**US-7.5 — Preview a module**
- Read-only render of a module's current draft via the existing JSON Forms preview, admin-only, no submission created.

### Epic US-8 — Session Templates

**US-8.1 — Create a session template**
- Name (required) and description (optional). New top-level entity with its own table/list, separate from `forms`.

**US-8.2 — Add modules to a session template**
- A picker lists **published** modules only (a draft-only module has nothing to reference yet), searchable with the same rules as US-7.4.
- Adding a module appends it to the template's ordered list; modules can be reordered and removed before publishing.
- A module already on the template is excluded from the picker (or disabled) — one instance per template, per the scope decisions above.

**US-8.3 — Preview a session template**
- Resolves each referenced module's *current published version* into one combined schema and renders it read-only, in module order — proves the "live reference" behaviour visibly: editing and republishing a module changes the template preview without touching the template itself.

**US-8.4 — Publish a session template**
- Creates an immutable session template version that snapshots which module version each reference pointed to at that moment (mirrors `FormVersion` capturing fields at publish time).
- The draft keeps tracking modules' current published versions after this; only the published version is frozen.

**US-8.5 — Fill out a published session template**
- Respondent-facing fill/submit flow against a published session template version, reusing the existing JSON Forms renderer and submission storage pattern (a submission JSONB blob tied to the exact version, per ADR-0004).
- If scope needs trimming to hit a demo date, this is the story to cut first — US-8.3's preview already demonstrates the composition concept without needing a real submission record.

**US-8.6 — Session templates library**
- New top-level nav item alongside Forms and Modules; same shape as US-7.4: list, search, archive.

**US-8.7 — View session template version history**
- A timeline of a session template's published versions, mirroring US-6.3's submission history list: version number, published date, publisher.

**US-8.8 — View a specific past session template version**
- Read-only view of one past version — which module versions it snapshotted, in what order — mirroring US-6.4's read-only past-version view for submissions.

## Phase 2 — module update propagation & safety (later)

Once Phase 1 proves the concept, these close the gap toward the brief's fuller picture — deliberately deferred so they don't block a first demo:

- **"Used in N templates" on the modules list** — visibility before an admin edits a widely-used module (brief §3.1's "used in N forms" badge, applied to modules).
- **Stale-draft notice on a session template** — "a module in this template has a newer published version" banner, before any approval gating exists.
- **Someone-else-is-editing indicator** — a module or template held in draft by one admin should be visible to a second admin before they start editing (brief §3.1).

## Explicitly out of scope (informed by the brief, not designed here)

- Entity-linked / "data bound" fields, and the client/case/participant model they'd need.
- Funder (DEX) locking, reporting-period locks, and matched-pair/outcomes logic.
- Roles, access control, and per-module/per-form ownership approval gates.
- Client-facing forms and the authentication decision they're blocked on.
- Attachment level (case/session/participant) and per-control client visibility — these apply once session templates render inside the real session-notes system, not to this standalone demo.
- Module-level version history — modules follow the same draft/publish pattern as forms already do without a history view today, so none is added here either; revisit alongside US-8.7/US-8.8 if it turns out to be needed.
