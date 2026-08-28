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
// rendered against.
export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formVersionId: uuid("form_version_id")
    .notNull()
    .references(() => formVersions.id, { onDelete: "restrict" }),
  data: jsonb("data").notNull(),
  status: text("status", { enum: ["draft", "submitted"] })
    .notNull()
    .default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
})
