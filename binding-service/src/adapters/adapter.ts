import type { BindingOptions, BindingStrategy } from "shared"

// Where a binding's value lives in the backing store: the DBS-internal
// mapping behind a logical binding key. Forms never see this -- swapping
// the store means remapping these, never changing a form.
export interface BindingSource {
  strategy: BindingStrategy
  entity: string
  attribute: string
  // For `lookup`: the reference table the attribute points at. For
  // `choice`: the option set, named `<entity>.<attribute>`.
  target?: string
}

// The option-set name a `choice` binding's target uses.
export const choiceTarget = (entity: string, attribute: string) => `${entity}.${attribute}`
export const isChoiceTarget = (target: string) => target.includes(".")

// A store value: text, or a lookup's referenced ID. null means no value.
// A store value as the DBS handles it: text, a lookup's row ID, or a
// choice's option value, all as strings. null means no value.
export type StoreValue = string | null

export interface StoredRecord {
  // Keyed by store attribute name.
  values: Record<string, StoreValue>
  // The store's row version, used to make a write conditional on nothing
  // having changed between the read and the write.
  etag: string
}

export interface Change {
  source: BindingSource
  value: StoreValue
}

// What the store says about one of an entity's attributes.
export interface AttributeMetadata {
  attribute: string
  displayName: string
  kind: "text" | "lookup" | "choice" | "other"
  maxLength?: number
  requiredLevel: "none" | "recommended" | "required"
  // Whether the store accepts updates to it at all.
  updatable: boolean
  // For a lookup, the reference table; for a choice, its option set.
  lookupTarget?: string
}

// What the DBS's own account may do in the store -- the ceiling on what any
// binding can offer (docs/proposals/databound-fields.md, guardrail 2).
export interface ServicePermissions {
  readEntity: boolean
  writeEntity: boolean
  // Setting a lookup takes Append on the entity and Append To on the target.
  appendEntity: boolean
  // Per lookup target: can the account read the reference table's rows?
  readTargets: Record<string, boolean>
  // Per lookup target: can a record be linked to its rows?
  appendToTargets: Record<string, boolean>
}

export interface ClientSummary {
  id: string
  clientNumber: string | null
  firstName: string | null
  lastName: string | null
}

// A session a client attended, and everyone who took part in it, by store IDs.
export interface SessionSummary {
  id: string
  subject: string | null
  start: string | null
  end: string | null
  participants: Array<{
    // The attendance record: one person at this session.
    id: string
    client: ClientSummary
    attendanceLabel: string | null
  }>
}

// A case, the clients on it, and every session regarding it, by store IDs.
export interface CaseSummary {
  id: string
  caseNumber: string | null
  title: string | null
  clients: ClientSummary[]
  sessions: SessionSummary[]
}

// The store refused a read -- in practice, the DBS's account lacks a
// privilege. `message` is safe to show a user.
export class StoreReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StoreReadError"
  }
}

// The store refused a write because the row changed after it was read (an
// If-Match mismatch).
export class ConcurrentUpdateError extends Error {
  constructor() {
    super("The record changed while it was being saved")
    this.name = "ConcurrentUpdateError"
  }
}

// The store refused a write for any other reason (privileges, plugin
// business rules, ...). `message` is safe to show a user.
export class StoreWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StoreWriteError"
  }
}

export interface RecordStore {
  // Names this store in the DBS's identity registry (identity.ts), which
  // maps DBS anchor IDs and option codes to each store's own IDs.
  readonly name: string
  // Human-facing client identifier -> the record to anchor on.
  findClientByNumber(clientNumber: string): Promise<ClientSummary | null>
  // The sessions a client has an attendance record for, with every
  // participant of each. Newest first.
  sessionsForClient(clientId: string): Promise<SessionSummary[]>
  // Human-facing case number -> the case, its clients and its sessions
  // (oldest first, each with every participant). null if no unambiguous match.
  findCaseByNumber(caseNumber: string): Promise<CaseSummary | null>
  read(
    entity: string,
    id: string,
    sources: BindingSource[],
  ): Promise<StoredRecord | null>
  write(entity: string, id: string, changes: Change[], etag: string): Promise<void>
  lookupOptions(target: string): Promise<BindingOptions>
  describe(entity: string, attributes: string[]): Promise<AttributeMetadata[]>
  permissions(entity: string, targets: string[]): Promise<ServicePermissions>
}
