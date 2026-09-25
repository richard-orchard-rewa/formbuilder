import {
  INITIAL_PRIVILEGES,
  LOOKUP_ROWS,
  seedContacts,
  type ContactRow,
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
  contacts = new Map<string, ContactRow>()
  privileges = new Set<string>()
  log: LoggedRequest[] = []

  constructor() {
    this.reset()
  }

  reset() {
    this.contacts = new Map(seedContacts().map((c) => [c.contactid, c]))
    this.privileges = new Set(INITIAL_PRIVILEGES)
    this.log = []
  }

  record(entry: LoggedRequest) {
    this.log.unshift(entry)
    this.log.length = Math.min(this.log.length, LOG_LIMIT)
  }

  lookupName(table: string, id: string | null) {
    if (!id) return null
    return LOOKUP_ROWS[table]?.find((row) => row.id === id)?.name ?? null
  }

  // A change made "in ICIS" by a staff member rather than through the API.
  // Bumps the row version, so a Data Binding Service write based on the
  // earlier version is refused (412).
  updateAsStaff(contactId: string, values: Record<string, string | null>) {
    const contact = this.contacts.get(contactId)
    if (!contact) return false
    contact.values = { ...contact.values, ...values }
    touch(contact, "Reception (ICIS)")
    return true
  }
}

export function touch(contact: ContactRow, by: string) {
  contact.version += 1
  contact.modifiedOn = new Date().toISOString()
  contact.modifiedBy = by
}
