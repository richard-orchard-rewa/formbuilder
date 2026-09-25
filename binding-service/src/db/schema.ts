import { sql } from "drizzle-orm"
import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

// The Data Binding Service's own database -- never form-builder's. These
// tables hold the identities the DBS issues (see src/identity.ts): as
// durable as every submission that references them, since losing a row
// orphans the anchors and codes stored in those submissions.

// A DBS-issued identity for a record forms are "about" (a client).
export const anchors = pgTable("anchors", {
  id: uuid("id").primaryKey(),
  anchor: text("anchor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Which record an anchor is in each store. One per store per anchor, and a
// store record belongs to exactly one anchor -- the unique index is what
// makes issuing an anchor race-safe.
export const anchorRefs = pgTable(
  "anchor_refs",
  {
    anchorId: uuid("anchor_id")
      .notNull()
      .references(() => anchors.id, { onDelete: "restrict" }),
    store: text("store").notNull(),
    storeId: text("store_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.anchorId, table.store] }),
    uniqueIndex("anchor_refs_store_record").on(table.store, table.storeId),
  ],
)

// A logical code for one option of a lookup list (e.g. csg_salutation: "mr").
export const optionCodes = pgTable(
  "option_codes",
  {
    target: text("target").notNull(),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.target, table.code] })],
)

// Which row a code is in each store. A store row has exactly one code.
export const optionCodeRefs = pgTable(
  "option_code_refs",
  {
    target: text("target").notNull(),
    code: text("code").notNull(),
    store: text("store").notNull(),
    storeId: text("store_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.target, table.code, table.store] }),
    uniqueIndex("option_code_refs_store_row").on(table.target, table.store, table.storeId),
    foreignKey({
      columns: [table.target, table.code],
      foreignColumns: [optionCodes.target, optionCodes.code],
    }).onDelete("restrict"),
  ],
)

// Bindings a data steward created in the binding creator (built-in ones
// are code, in src/dictionary.ts). The source -- which store attribute the
// key maps to -- is fixed once created; each attribute has one binding.
export const configuredBindings = pgTable(
  "configured_bindings",
  {
    key: text("key").primaryKey(),
    strategy: text("strategy", { enum: ["attribute", "lookup"] }).notNull(),
    entity: text("entity").notNull(),
    attribute: text("attribute").notNull(),
    target: text("target"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("configured_bindings_attribute").on(table.entity, table.attribute)],
)

// Every version of a configured binding. Published versions are immutable --
// forms snapshot them -- which a trigger enforces (see the
// published_binding_versions_are_immutable migration); at most one draft
// exists per binding.
export const bindingVersions = pgTable(
  "binding_versions",
  {
    key: text("key")
      .notNull()
      .references(() => configuredBindings.key, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    descriptor: jsonb("descriptor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.version] }),
    uniqueIndex("binding_versions_one_draft")
      .on(table.key)
      .where(sql`${table.status} = 'draft'`),
  ],
)
