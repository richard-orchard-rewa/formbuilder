import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { BindingAnchor } from "shared"

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

export interface AnchorRecord {
  id: string
  anchor: BindingAnchor
  // Store name -> that store's ID for the record.
  refs: Record<string, string>
}

export interface OptionCodeRecord {
  code: string
  // Store name -> that store's row ID for the option.
  refs: Record<string, string>
}

export interface IdentityData {
  anchors: AnchorRecord[]
  // Lookup target (e.g. "csg_salutation") -> its options' codes.
  optionCodes: Record<string, OptionCodeRecord[]>
}

export interface IdentityRepository {
  load(): Promise<IdentityData>
  save(data: IdentityData): Promise<void>
}

const empty = (): IdentityData => ({ anchors: [], optionCodes: {} })

export class InMemoryIdentityRepository implements IdentityRepository {
  private data = empty()
  async load() {
    return structuredClone(this.data)
  }
  async save(data: IdentityData) {
    this.data = structuredClone(data)
  }
}

// Prototype storage: one JSON file, rewritten atomically. A real DBS keeps
// these in a database -- they're as durable as the submissions that
// reference them.
export class JsonFileIdentityRepository implements IdentityRepository {
  constructor(private readonly path: string) {}

  async load(): Promise<IdentityData> {
    try {
      return { ...empty(), ...(JSON.parse(await readFile(this.path, "utf8")) as IdentityData) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty()
      throw error
    }
  }

  async save(data: IdentityData): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    await writeFile(temp, JSON.stringify(data, null, 2))
    await rename(temp, this.path)
  }
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

// Issues and translates DBS-owned identities. Every change is serialised
// through one queue so concurrent requests can't lose each other's new IDs.
export class IdentityRegistry {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly repo: IdentityRepository) {}

  private exclusive<T>(work: (data: IdentityData) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.repo.load()
      const before = JSON.stringify(data)
      const result = await work(data)
      if (JSON.stringify(data) !== before) await this.repo.save(data)
      return result
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  // The DBS's ID for a store record, issued the first time it's seen.
  anchorFor(anchor: BindingAnchor, store: string, storeId: string): Promise<string> {
    return this.exclusive((data) => {
      const existing = data.anchors.find(
        (a) => a.anchor === anchor && a.refs[store] === storeId,
      )
      if (existing) return existing.id
      const record: AnchorRecord = { id: randomUUID(), anchor, refs: { [store]: storeId } }
      data.anchors.push(record)
      return record.id
    })
  }

  // The store's ID for a DBS anchor, or null if unknown in that store.
  storeIdForAnchor(anchorId: string, store: string): Promise<string | null> {
    return this.exclusive((data) => data.anchors.find((a) => a.id === anchorId)?.refs[store] ?? null)
  }

  // Codes for a store's option rows, assigning new ones from their labels
  // the first time each row is seen. A row keeps its code if its label
  // later changes.
  codesFor(
    target: string,
    store: string,
    rows: Array<{ storeId: string; label: string }>,
  ): Promise<string[]> {
    return this.exclusive((data) => {
      const codes = (data.optionCodes[target] ??= [])
      return rows.map((row) => {
        const known = codes.find((c) => c.refs[store] === row.storeId)
        if (known) return known.code
        const base = slugify(row.label)
        let code = base
        for (let n = 2; codes.some((c) => c.code === code); n++) code = `${base}-${n}`
        codes.push({ code, refs: { [store]: row.storeId } })
        return code
      })
    })
  }

  // The code already assigned to a store row, or null if it hasn't been seen.
  codeForStoreId(target: string, store: string, storeId: string): Promise<string | null> {
    return this.exclusive(
      (data) => data.optionCodes[target]?.find((c) => c.refs[store] === storeId)?.code ?? null,
    )
  }

  // The store's row ID for a code, or null if the code means nothing there.
  storeIdForCode(target: string, store: string, code: string): Promise<string | null> {
    return this.exclusive(
      (data) => data.optionCodes[target]?.find((c) => c.code === code)?.refs[store] ?? null,
    )
  }
}
