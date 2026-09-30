import type { BindingOptions, BindingStrategy, SessionStatus } from "shared"

// Where a binding's value lives in the backing store: the DBS-internal
// mapping behind a logical binding key. Forms never see this -- swapping
// the store means remapping these, never changing a form.
export interface BindingSource {
  strategy: BindingStrategy
  entity: string
  attribute: string
  // For `lookup`: the reference table the attribute points at.
  target?: string
}

// The list a lookup or choice binding's options come from, as the DBS's
// option codes are keyed (identity.ts): a lookup's reference table, or a
// choice column's own option set. null for a binding with no options.
export function optionListOf(source: BindingSource): string | null {
  if (source.strategy === "lookup") return source.target ?? null
  if (source.strategy === "choice") return `${source.entity}.${source.attribute}`
  return null
}

// A store value: text, a lookup's referenced ID, or a choice's option
// value, all as strings. null means no value.
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
  kind: "text" | "lookup" | "other"
  maxLength?: number
  requiredLevel: "none" | "recommended" | "required"
  // Whether the store accepts updates to it at all.
  updatable: boolean
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

export interface CaseSummary {
  id: string
  caseNumber: string | null
  title: string | null
}

export interface SessionSummary {
  id: string
  subject: string | null
  scheduledStart: string | null
  status: SessionStatus
}

// A case and what hangs off it, in store IDs.
export interface CaseRecord extends CaseSummary {
  clients: Array<ClientSummary & { primary: boolean }>
  sessions: SessionSummary[]
}

// A session, its case, and each client's participation in it. A
// participant's `id` is the store's record of that participation (its
// attendance), which is what a `sessionParticipant` binding reads and writes.
export interface SessionRecord extends SessionSummary {
  case: CaseSummary | null
  participants: Array<{ id: string; client: ClientSummary }>
}

// The store refused a write because the row changed after it was read (an
// If-Match mismatch).
export class ConcurrentUpdateError extends Error {
  constructor() {
    super("The record changed while it was being saved")
    this.name = "ConcurrentUpdateError"
  }
}

// The store refused a read -- in practice, the DBS's account lacks a
// privilege. `message` is safe to show a user.
export class StoreReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StoreReadError"
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
  // Human-facing case number -> the case record.
  findCaseByNumber(caseNumber: string): Promise<CaseSummary | null>
  // A case with its clients and sessions, or null if there's no such case.
  readCase(id: string): Promise<CaseRecord | null>
  // A session with its case and participants, or null.
  readSession(id: string): Promise<SessionRecord | null>
  read(
    entity: string,
    id: string,
    sources: BindingSource[],
  ): Promise<StoredRecord | null>
  write(entity: string, id: string, changes: Change[], etag: string): Promise<void>
  lookupOptions(target: string): Promise<BindingOptions>
  // A choice column's option set, values as strings.
  choiceOptions(entity: string, attribute: string): Promise<BindingOptions>
  describe(entity: string, attributes: string[]): Promise<AttributeMetadata[]>
  permissions(entity: string, targets: string[]): Promise<ServicePermissions>
}
