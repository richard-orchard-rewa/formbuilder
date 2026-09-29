import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import type { BindingAnchor } from "shared"
import type { Db } from "./db/client.js"
import { anchorRefs, anchors, optionCodeRefs, optionCodes } from "./db/schema.js"

// Identities that belong to the Data Binding Service rather than to any
// backing store (docs/proposals/databound-fields.md, "Beyond Dataverse").
//
// - An **anchor** (the client a form is about) gets a DBS-issued ID. Forms
//   and submissions only ever hold that; which record it is in each store
//   is recorded here, so moving a client's data to another store means
//   adding a reference, not rewriting every submission.
// - A lookup **option** gets a logical code ("mr", "not-stated"). Forms and
//   submissions hold the code; which row it is in each store is recorded
//   here, so a code survives the list moving to another store.
export interface IdentityRegistry {
  // The DBS's ID for a store record, issued the first time it's seen.
  anchorFor(anchor: BindingAnchor, store: string, storeId: string): Promise<string>
  // The store's ID for a DBS anchor, or null if unknown in that store.
  storeIdForAnchor(anchorId: string, store: string): Promise<string | null>
  // Codes for a store's option rows, assigning new ones from their labels
  // the first time each row is seen. A row keeps its code if its label
  // later changes.
  codesFor(
    target: string,
    store: string,
    rows: Array<{ storeId: string; label: string }>,
  ): Promise<string[]>
  // The code already assigned to a store row, or null if it hasn't been seen.
  codeForStoreId(target: string, store: string, storeId: string): Promise<string | null>
  // The store's row ID for a code, or null if the code means nothing there.
  storeIdForCode(target: string, store: string, code: string): Promise<string | null>
}

// "Not Stated" -> "not-stated"
export function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "option"
  )
}

// A new code for `label` that isn't already in `taken`.
function uniqueCode(label: string, taken: Set<string>): string {
  const base = slugify(label)
  let code = base
  for (let n = 2; taken.has(code); n++) code = `${base}-${n}`
  return code
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The durable registry: the DBS's own Postgres database. Issuing an
// identity takes a transaction-scoped advisory lock on what's being issued
// for (one store record, or one lookup list), so concurrent requests --
// across DBS instances too -- agree on a single ID or code; the unique
// indexes back that up.
export class PostgresIdentityRegistry implements IdentityRegistry {
  constructor(private readonly db: Db) {}

  anchorFor(anchor: BindingAnchor, store: string, storeId: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`anchor:${store}:${storeId}`}))`)
      const [existing] = await tx
        .select({ id: anchorRefs.anchorId })
        .from(anchorRefs)
        .where(and(eq(anchorRefs.store, store), eq(anchorRefs.storeId, storeId)))
      if (existing) return existing.id
      const id = randomUUID()
      await tx.insert(anchors).values({ id, anchor })
      await tx.insert(anchorRefs).values({ anchorId: id, store, storeId })
      return id
    })
  }

  async storeIdForAnchor(anchorId: string, store: string): Promise<string | null> {
    // Anything that isn't a UUID was never issued by the DBS.
    if (!UUID.test(anchorId)) return null
    const [ref] = await this.db
      .select({ storeId: anchorRefs.storeId })
      .from(anchorRefs)
      .where(and(eq(anchorRefs.anchorId, anchorId), eq(anchorRefs.store, store)))
    return ref?.storeId ?? null
  }

  codesFor(
    target: string,
    store: string,
    rows: Array<{ storeId: string; label: string }>,
  ): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`options:${target}`}))`)
      const taken = new Set(
        (
          await tx
            .select({ code: optionCodes.code })
            .from(optionCodes)
            .where(eq(optionCodes.target, target))
        ).map((r) => r.code),
      )
      const refs = new Map(
        (
          await tx
            .select({ storeId: optionCodeRefs.storeId, code: optionCodeRefs.code })
            .from(optionCodeRefs)
            .where(and(eq(optionCodeRefs.target, target), eq(optionCodeRefs.store, store)))
        ).map((r) => [r.storeId, r.code]),
      )
      const codes: string[] = []
      for (const row of rows) {
        let code = refs.get(row.storeId)
        if (!code) {
          code = uniqueCode(row.label, taken)
          await tx.insert(optionCodes).values({ target, code })
          await tx.insert(optionCodeRefs).values({ target, code, store, storeId: row.storeId })
          taken.add(code)
          refs.set(row.storeId, code)
        }
        codes.push(code)
      }
      return codes
    })
  }

  async codeForStoreId(target: string, store: string, storeId: string) {
    const [ref] = await this.db
      .select({ code: optionCodeRefs.code })
      .from(optionCodeRefs)
      .where(
        and(
          eq(optionCodeRefs.target, target),
          eq(optionCodeRefs.store, store),
          eq(optionCodeRefs.storeId, storeId),
        ),
      )
    return ref?.code ?? null
  }

  async storeIdForCode(target: string, store: string, code: string) {
    const [ref] = await this.db
      .select({ storeId: optionCodeRefs.storeId })
      .from(optionCodeRefs)
      .where(
        and(
          eq(optionCodeRefs.target, target),
          eq(optionCodeRefs.store, store),
          eq(optionCodeRefs.code, code),
        ),
      )
    return ref?.storeId ?? null
  }
}

// For tests and the in-memory fake store only: its identities last exactly
// as long as the fake's records do.
export class InMemoryIdentityRegistry implements IdentityRegistry {
  private readonly anchors: Array<{ id: string; refs: Record<string, string> }> = []
  private readonly codes = new Map<string, Array<{ code: string; refs: Record<string, string> }>>()

  async anchorFor(_anchor: BindingAnchor, store: string, storeId: string) {
    const existing = this.anchors.find((a) => a.refs[store] === storeId)
    if (existing) return existing.id
    const record = { id: randomUUID(), refs: { [store]: storeId } }
    this.anchors.push(record)
    return record.id
  }

  async storeIdForAnchor(anchorId: string, store: string) {
    return this.anchors.find((a) => a.id === anchorId)?.refs[store] ?? null
  }

  async codesFor(target: string, store: string, rows: Array<{ storeId: string; label: string }>) {
    const list = this.codes.get(target) ?? []
    this.codes.set(target, list)
    return rows.map((row) => {
      const known = list.find((c) => c.refs[store] === row.storeId)
      if (known) return known.code
      const code = uniqueCode(row.label, new Set(list.map((c) => c.code)))
      list.push({ code, refs: { [store]: row.storeId } })
      return code
    })
  }

  async codeForStoreId(target: string, store: string, storeId: string) {
    return this.codes.get(target)?.find((c) => c.refs[store] === storeId)?.code ?? null
  }

  async storeIdForCode(target: string, store: string, code: string) {
    return this.codes.get(target)?.find((c) => c.code === code)?.refs[store] ?? null
  }
}
