import { sql } from "drizzle-orm"
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  unique,
  uniqueIndex,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

// A form is the container that owns a sequence of versions. Its own fields
// are metadata only — the actual field definitions live on form_versions so
// editing a draft never touches submissions made against a published one.
export const forms = pgTable("forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  // The stable, human-readable identifier consuming apps use to request this
  // form (as opposed to `id`, which is an implementation detail).
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Each edit of a form is a new version rather than a mutation in place, so a
// live/published version stays immutable for as long as submissions can
// reference it (US-1.3, US-1.4).
export const formVersions = pgTable(
  "form_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // The field/layout definition, expressed as the app's Zod-derived schema
    // shape (see US-0.3, Zod-to-JSON-Schema) rather than a fixed set of
    // columns per field type.
    schema: jsonb("schema").notNull(),
    // "published" is the single active version used for new submissions;
    // publishing a draft demotes any previously published version to
    // "superseded" (US-1.2) so it stays retrievable but not editable.
    status: text("status", { enum: ["draft", "published", "superseded"] })
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // Freeform identifier of who published this version (US-1.4). There's no
    // auth/user system yet, so this is whatever the caller supplies rather
    // than a foreign key to a users table.
    publishedBy: text("published_by"),
  },
  (table) => [
    unique("form_versions_form_id_version_key").on(
      table.formId,
      table.version,
    ),
    check(
      "form_versions_published_at_matches_status",
      sql`(${table.status} = 'draft') = (${table.publishedAt} is null)`,
    ),
    uniqueIndex("form_versions_one_published_per_form")
      .on(table.formId)
      .where(sql`${table.status} = 'published'`),
  ],
)

// A submission always targets one specific version, so editing the form
// later can never change what an existing submission is validated or
// rendered against. `formId` is denormalized from `formVersionId` (rather
// than requiring a join through form_versions) so reporting queries can
// filter/group submissions by form directly (US-4.2). The submission's own
// metadata lives in typed columns; the admin-defined, per-form answer set
// itself has no fixed shape, so it lives in `data` (US-4.2).
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "restrict" }),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => formVersions.id, { onDelete: "restrict" }),
    data: jsonb("data").notNull(),
    // Values migrated from an older version whose field either no longer
    // exists in this submission's version or couldn't be safely converted
    // to its replacement's type (US-6.1). Keyed by the *original* field id
    // so nothing a migration can't confidently place is ever silently
    // discarded -- it just isn't part of the live form's data.
    legacyData: jsonb("legacy_data"),
    status: text("status", { enum: ["draft", "submitted"] })
      .notNull()
      .default("draft"),
    // Freeform identifier of who submitted this, mirroring `publishedBy`
    // above -- there's no auth/user system yet, so this is whatever the
    // caller supplies rather than a foreign key to a users table.
    submittedBy: text("submitted_by"),
    // Set when this row was produced by migrating another submission onto a
    // newer version (US-6.1) rather than being captured directly. The
    // original submission is left untouched -- a version is immutable once
    // published (ADR-0004) -- so a migration always creates a new row
    // rather than converting one in place.
    migratedFromSubmissionId: uuid("migrated_from_submission_id").references(
      (): AnyPgColumn => submissions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    // A submission can only be migrated onto a given target version once --
    // re-running a bulk migration (e.g. after fixing a mapping) must not
    // create duplicate copies (US-6.1).
    uniqueIndex("submissions_one_migration_per_target_version")
      .on(table.migratedFromSubmissionId, table.formVersionId)
      .where(sql`${table.migratedFromSubmissionId} is not null`),
  ],
)

// A module is a reusable, named group of fields (US-7.1) -- built and
// published the same way a form is (draft -> published version, ADR-0004),
// but consumed by session templates (Epic US-8) rather than filled out
// directly. Unlike forms it can be archived (US-7.4) and has no `slug` --
// nothing addresses a module by a public URL.
export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Mirrors form_versions exactly (US-7.3): a module's draft can be edited
// freely, and publishing it locks that version as immutable so anything
// already referencing it (a session template, Epic US-8) never shifts.
export const moduleVersions = pgTable(
  "module_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // Same shape as form_versions.schema: { fields: Field[] }.
    schema: jsonb("schema").notNull(),
    status: text("status", { enum: ["draft", "published", "superseded"] })
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by"),
  },
  (table) => [
    unique("module_versions_module_id_version_key").on(
      table.moduleId,
      table.version,
    ),
    check(
      "module_versions_published_at_matches_status",
      sql`(${table.status} = 'draft') = (${table.publishedAt} is null)`,
    ),
    uniqueIndex("module_versions_one_published_per_module")
      .on(table.moduleId)
      .where(sql`${table.status} = 'published'`),
  ],
)

// A session template is a new top-level entity (US-8.1) -- a named,
// ordered composition of modules, distinct from a form. Unlike forms/
// modules, it has no field-level draft schema of its own to edit: what an
// admin edits is *which modules, in what order* (session_template_modules
// below), and publishing snapshots that into an immutable version.
export const sessionTemplates = pgTable("session_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// The template's current, always-mutable composition (US-8.2): which
// modules it references and in what order. Resolving this always uses each
// module's *current* published version -- the "live reference" decision in
// docs/proposals/modules-and-session-templates.md -- so improving a module
// updates every draft template that uses it. `unique(sessionTemplateId,
// moduleId)` enforces one instance of a module per template.
export const sessionTemplateModules = pgTable(
  "session_template_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionTemplateId: uuid("session_template_id")
      .notNull()
      .references(() => sessionTemplates.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("session_template_modules_template_id_module_id_key").on(
      table.sessionTemplateId,
      table.moduleId,
    ),
  ],
)

// Publishing a session template (US-8.4) snapshots which module *version*
// each reference pointed to at that moment -- unlike form_versions/
// module_versions, a row here is only ever created already "published"
// (there's no field schema to hold in draft beforehand), so there's no
// "draft" status and no published-at-matches-status check needed.
export const sessionTemplateVersions = pgTable(
  "session_template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionTemplateId: uuid("session_template_id")
      .notNull()
      .references(() => sessionTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // Ordered snapshot: [{ moduleId, moduleVersionId }, ...]. Kept
    // denormalized (not a join table) so a past version's exact composition
    // is preserved even if session_template_modules later changes.
    modules: jsonb("modules").notNull(),
    status: text("status", { enum: ["published", "superseded"] })
      .notNull()
      .default("published"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedBy: text("published_by"),
  },
  (table) => [
    unique("session_template_versions_template_id_version_key").on(
      table.sessionTemplateId,
      table.version,
    ),
    uniqueIndex("session_template_versions_one_published_per_template")
      .on(table.sessionTemplateId)
      .where(sql`${table.status} = 'published'`),
  ],
)

// A respondent's fill-out of a published session template (US-8.5),
// mirroring `submissions` but against a session template version instead
// of a form version. No draft-save/migration support -- out of scope for
// Epic US-8 (see docs/proposals/modules-and-session-templates.md).
export const sessionTemplateSubmissions = pgTable("session_template_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionTemplateId: uuid("session_template_id")
    .notNull()
    .references(() => sessionTemplates.id, { onDelete: "restrict" }),
  sessionTemplateVersionId: uuid("session_template_version_id")
    .notNull()
    .references(() => sessionTemplateVersions.id, { onDelete: "restrict" }),
  data: jsonb("data").notNull(),
  submittedBy: text("submitted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// An immutable audit trail of edits made to a submitted submission (US-5.2,
// US-6.1): one row per edit, capturing a full snapshot of the row as it
// stood immediately before the edit applied. Populated by a Postgres
// `BEFORE UPDATE` trigger on `submissions` (see the
// submission_archive_trigger migration) rather than application code, so
// the archive step can never be skipped by a code path that updates
// `submissions` directly, and so it shares the row-level lock Postgres
// already takes for the `UPDATE` itself -- closing the race a purely
// app-level SELECT-then-INSERT-then-UPDATE would be exposed to.
export const submissionHistory = pgTable(
  "submission_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    // Denormalized snapshot of the row's own fields at archive time,
    // mirroring `submissions` itself.
    formId: uuid("form_id").notNull(),
    formVersionId: uuid("form_version_id").notNull(),
    data: jsonb("data").notNull(),
    legacyData: jsonb("legacy_data"),
    status: text("status", { enum: ["draft", "submitted"] }).notNull(),
    submittedBy: text("submitted_by"),
    migratedFromSubmissionId: uuid("migrated_from_submission_id"),
    // Freeform identifier of who made this edit, mirroring `submittedBy` and
    // `publishedBy` above -- there's no auth/user system yet, so this is
    // whatever the caller supplies rather than a foreign key to a users
    // table. Captured by the trigger via a transaction-local Postgres
    // setting (`app.edited_by`), since a trigger has no direct access to
    // application-level call arguments.
    editedBy: text("edited_by"),
    // SCD Type 2 columns: the window during which this snapshot was the
    // live row's value. `activeFrom` is the superseded row's own
    // `updated_at`; `activeTo` is when the archiving UPDATE ran.
    activeFrom: timestamp("active_from", { withTimezone: true }).notNull(),
    activeTo: timestamp("active_to", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("submission_history_submission_id").on(table.submissionId),
  ],
)

// Each attempt to send a submission's data-bound values to the Data Binding
// Service (docs/proposals/databound-fields.md): which record they were
// bound to, what the form opened with, what was sent, and the per-binding
// outcome. Kept beside `submissions` rather than on it so the submission's
// own row -- and its history trigger -- stay exactly the record of what was
// captured. A prototype table; it's the natural seed of a future outbox.
export const submissionBindings = pgTable(
  "submission_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    anchor: jsonb("anchor"),
    baseline: jsonb("baseline"),
    values: jsonb("values").notNull(),
    results: jsonb("results").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("submission_bindings_submission_id").on(table.submissionId),
  ],
)
