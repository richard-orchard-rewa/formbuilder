import type { BindingOptions } from "shared"
import {
  ConcurrentUpdateError,
  type ClientRecord,
  type ClientStore,
  type ClientSummary,
  type StoredClient,
} from "./adapter.js"

// Salutations as observed on contacts in test ICIS (2026-09-25). Also the
// ICIS adapter's fallback when it can't read the salutation table itself.
export const KNOWN_TITLES: BindingOptions["options"] = [
  { value: "898b6ce9-e68f-df11-aff9-0050569f692b", label: "Miss" },
  { value: "8a8b6ce9-e68f-df11-aff9-0050569f692b", label: "Mr" },
  { value: "8b8b6ce9-e68f-df11-aff9-0050569f692b", label: "Mrs" },
  { value: "8c8b6ce9-e68f-df11-aff9-0050569f692b", label: "Ms" },
  { value: "c286e810-bdfe-df11-93cd-005056890003", label: "Not Stated" },
]

export const FAKE_CLIENT_ID = "00000000-0000-0000-0000-000000152076"

// An in-memory client store so development, unit tests and e2e run without
// ICIS. Seeded with a stand-in for the test-ICIS contact the prototype uses.
export class FakeClientStore implements ClientStore {
  private readonly clients = new Map<string, { record: ClientRecord; version: number }>()

  constructor(
    seed: Array<{ id: string; record: ClientRecord }> = [
      {
        id: FAKE_CLIENT_ID,
        record: {
          clientNumber: "00152076",
          titleId: KNOWN_TITLES[1].value,
          firstName: "Bob",
          lastName: "McGee",
        },
      },
    ],
  ) {
    for (const { id, record } of seed) {
      this.clients.set(id, { record: { ...record }, version: 1 })
    }
  }

  async findByClientNumber(clientNumber: string): Promise<ClientSummary | null> {
    for (const [id, { record }] of this.clients) {
      if (record.clientNumber === clientNumber) {
        return {
          id,
          clientNumber: record.clientNumber,
          firstName: record.firstName,
          lastName: record.lastName,
        }
      }
    }
    return null
  }

  async get(id: string): Promise<StoredClient | null> {
    const found = this.clients.get(id)
    if (!found) return null
    return { record: { ...found.record }, etag: String(found.version) }
  }

  async update(
    id: string,
    patch: Partial<Omit<ClientRecord, "clientNumber">>,
    etag: string,
  ): Promise<void> {
    const found = this.clients.get(id)
    if (!found || String(found.version) !== etag) {
      throw new ConcurrentUpdateError()
    }
    found.record = { ...found.record, ...patch }
    found.version += 1
  }

  async listTitles(): Promise<BindingOptions> {
    return { options: KNOWN_TITLES, source: "live" }
  }
}
