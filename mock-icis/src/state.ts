import {
  INITIAL_PRIVILEGES,
  LOOKUP_ROWS,
  seedAttendances,
  seedContacts,
  seedSessions,
  type RecordRow,
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
  // Rows per record entity (logical name -> id -> row).
  tables = new Map<string, Map<string, RecordRow>>()
  privileges = new Set<string>()
  log: LoggedRequest[] = []

  constructor() {
    this.reset()
  }

  get contacts() {
    return this.table("contact")
  }

  get sessions() {
    return this.table("wp_session")
  }

  get attendances() {
    return this.table("csg_attendance")
  }

  table(entity: string): Map<string, RecordRow> {
    let rows = this.tables.get(entity)
    if (!rows) {
      rows = new Map()
      this.tables.set(entity, rows)
    }
    return rows
  }

  reset() {
    const byId = (rows: RecordRow[]) => new Map(rows.map((r) => [r.id, r]))
    this.tables = new Map([
      ["contact", byId(seedContacts())],
      ["wp_session", byId(seedSessions())],
      ["csg_attendance", byId(seedAttendances())],
    ])
    this.privileges = new Set(INITIAL_PRIVILEGES)
    this.log = []
  }

  record(entry: LoggedRequest) {
    this.log.unshift(entry)
    this.log.length = Math.min(this.log.length, LOG_LIMIT)
  }

  lookupName(table: string, id: string | number | null) {
    if (id === null || id === undefined) return null
    return LOOKUP_ROWS[table]?.find((row) => row.id === id)?.name ?? null
  }

  // A change made "in ICIS" by a staff member rather than through the API.
  // Bumps the row version, so a Data Binding Service write based on the
  // earlier version is refused (412).
  updateAsStaff(entity: string, id: string, values: RecordRow["values"]) {
    const row = this.table(entity).get(id)
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
