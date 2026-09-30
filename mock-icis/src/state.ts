import {
  INITIAL_PRIVILEGES,
  LOOKUP_ROWS,
  RECORD_ENTITIES,
  seedCases,
  seedContacts,
  type ContactRow,
  type RecordRow,
  type Value,
} from "./data.js"

export interface LoggedRequest {
  at: string
  method: string
  path: string
  status: number
}

const LOG_LIMIT = 200

// Everything the mock holds, in memory. Restarting (or "Reset demo") puts it
// back to the seed.
export class MockIcisState {
  // Record tables by entity logical name, each keyed by primary key.
  records = new Map<string, Map<string, RecordRow>>()
  privileges = new Set<string>()
  log: LoggedRequest[] = []

  constructor() {
    this.reset()
  }

  reset() {
    const cases = seedCases()
    const tables: Record<string, RecordRow[]> = { contact: seedContacts(), ...cases }
    this.records = new Map(
      RECORD_ENTITIES.map((e) => [
        e.logicalName,
        new Map((tables[e.logicalName] ?? []).map((row) => [row.id, row])),
      ]),
    )
    this.privileges = new Set(INITIAL_PRIVILEGES)
    this.log = []
  }

  get contacts(): Map<string, ContactRow> {
    return this.table("contact")
  }

  table(entity: string): Map<string, RecordRow> {
    const table = this.records.get(entity)
    if (!table) throw new Error(`The mock holds no ${entity} records`)
    return table
  }

  record(entry: LoggedRequest) {
    this.log.unshift(entry)
    this.log.length = Math.min(this.log.length, LOG_LIMIT)
  }

  lookupName(table: string, id: Value | undefined) {
    if (!id) return null
    return LOOKUP_ROWS[table]?.find((row) => row.id === id)?.name ?? null
  }

  // A change made "in ICIS" by a staff member rather than through the API.
  // Bumps the row version, so a Data Binding Service write based on the
  // earlier version is refused (412).
  updateAsStaff(contactId: string, values: Record<string, Value>) {
    return this.updateRecordAsStaff("contact", contactId, values)
  }

  updateRecordAsStaff(entity: string, id: string, values: Record<string, Value>) {
    const row = this.records.get(entity)?.get(id)
    if (!row) return false
    row.values = { ...row.values, ...values }
    touch(row, "Reception (ICIS)")
    return true
  }
}

export function touch(row: RecordRow, by: string) {
  row.version += 1
  row.modifiedOn = new Date().toISOString()
  row.modifiedBy = by
}
