import type { BindingOptions } from "shared"

// The DBS's own, store-agnostic view of a client. The dictionary maps
// bindings onto these properties; each adapter translates them to and from
// its backing store. Nothing outside an adapter knows ICIS column names.
export interface ClientRecord {
  clientNumber: string | null
  titleId: string | null
  firstName: string | null
  lastName: string | null
}

export type ClientProperty = keyof ClientRecord

export interface ClientSummary {
  id: string
  clientNumber: string | null
  firstName: string | null
  lastName: string | null
}

export interface StoredClient {
  record: ClientRecord
  // The backing store's row version, used to make the write conditional on
  // nothing having changed between this read and the write.
  etag: string
}

// The backing store refused a write because the row changed after it was
// read (an If-Match mismatch).
export class ConcurrentUpdateError extends Error {
  constructor() {
    super("The record changed while it was being saved")
    this.name = "ConcurrentUpdateError"
  }
}

// The backing store refused a write for any other reason (privileges,
// plugin business rules, ...). `message` is safe to show a user.
export class StoreWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StoreWriteError"
  }
}

export interface ClientStore {
  // Human-facing client identifier (ICIS `csg_clientid`) -> the record.
  findByClientNumber(clientNumber: string): Promise<ClientSummary | null>
  get(id: string): Promise<StoredClient | null>
  update(
    id: string,
    patch: Partial<Omit<ClientRecord, "clientNumber">>,
    etag: string,
  ): Promise<void>
  listTitles(): Promise<BindingOptions>
}
