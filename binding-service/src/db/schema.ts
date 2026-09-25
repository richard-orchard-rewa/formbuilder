import {
  foreignKey,
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
