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

// An immutable audit trail of edits made to a submitted submission (US-5.2):
// one row per edit, capturing the full prior data snapshot so a full history
// of who changed what and when can be reconstructed, mirroring how
// form_versions never mutates a published row in place.
export const submissionEdits = pgTable("submission_edits", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  // The submission's data immediately before this edit was applied, so the
  // edit history can show what changed rather than just that it did.
  previousData: jsonb("previous_data").notNull(),
  // Freeform identifier of who made this edit, mirroring `submittedBy` and
  // `publishedBy` above -- there's no auth/user system yet, so this is
  // whatever the caller supplies rather than a foreign key to a users table.
  editedBy: text("edited_by"),
  editedAt: timestamp("edited_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
