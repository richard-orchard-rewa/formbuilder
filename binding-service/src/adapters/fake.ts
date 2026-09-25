import type { BindingOptions } from "shared"
import {
  ConcurrentUpdateError,
  type AttributeMetadata,
  type BindingSource,
  type Change,
  type ClientSummary,
  type RecordStore,
  type ServicePermissions,
  type StoreValue,
  type StoredRecord,
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

// Metadata mirroring test ICIS's `contact` for the allow-listed attributes
// (display names and lengths as probed on 2026-09-25).
const text = (attribute: string, displayName: string, maxLength: number): AttributeMetadata => ({
  attribute,
  displayName,
  kind: "text",
  maxLength,
  requiredLevel: "none",
  updatable: true,
})
const lookup = (attribute: string, displayName: string, target: string): AttributeMetadata => ({
  attribute,
  displayName,
  kind: "lookup",
  requiredLevel: "none",
  updatable: true,
  lookupTarget: target,
})

export const FAKE_CONTACT_METADATA: AttributeMetadata[] = [
  lookup("csg_salutationid", "Title", "csg_salutation"),
  { ...text("firstname", "First Name", 50), requiredLevel: "recommended" },
  text("middlename", "Middle Name", 50),
  { ...text("lastname", "Last Name", 50), requiredLevel: "recommended" },
  text("csg_alias", "Preferred Name", 100),
  text("rawa_preferredgender", "Preferred Gender Term", 100),
  lookup("csg_genderid", "Gender", "csg_gender"),
  lookup("csg_home_languageid", "Home Language", "csg_language"),
  text("mobilephone", "Mobile Phone", 50),
  text("telephone2", "Home Phone", 50),
  text("emailaddress1", "Email", 100),
  text("csg_clientid", "Contact ID", 100),
]

const FAKE_OPTIONS: Record<string, BindingOptions["options"]> = {
  csg_salutation: KNOWN_TITLES,
  csg_gender: [
    { value: "7c1c5d2e-0000-4000-8000-000000000001", label: "Female" },
    { value: "7c1c5d2e-0000-4000-8000-000000000002", label: "Male" },
    { value: "7c1c5d2e-0000-4000-8000-000000000003", label: "Non-binary" },
    { value: "7c1c5d2e-0000-4000-8000-000000000004", label: "Not stated" },
  ],
}

// An in-memory store so development, unit tests and e2e run without ICIS.
// Seeded with a stand-in for the test-ICIS contact the prototype uses. The
// account's privileges are adjustable so the creator's ceilings can be
// exercised; by default it may do everything except read the language list.
export class FakeRecordStore implements RecordStore {
  readonly name = "fake"
  private readonly records = new Map<
    string,
    { values: Record<string, StoreValue>; version: number }
  >()

  constructor(
    public privileges: {
      writeEntity: boolean
      readableTargets: Set<string>
    } = { writeEntity: true, readableTargets: new Set(["csg_salutation", "csg_gender"]) },
  ) {
    this.records.set(FAKE_CLIENT_ID, {
      version: 1,
      values: {
        csg_clientid: "00152076",
        csg_salutationid: KNOWN_TITLES[1].value,
        firstname: "Bob",
        lastname: "McGee",
        middlename: null,
        csg_alias: "Bobby",
        mobilephone: null,
      },
    })
  }

  private byClientNumber(clientNumber: string) {
    for (const [id, record] of this.records) {
      if (record.values.csg_clientid === clientNumber) return { id, record }
    }
    return null
  }

  async findClientByNumber(clientNumber: string): Promise<ClientSummary | null> {
    const found = this.byClientNumber(clientNumber)
    if (!found) return null
    const { values } = found.record
    return {
      id: found.id,
      clientNumber: values.csg_clientid ?? null,
      firstName: values.firstname ?? null,
      lastName: values.lastname ?? null,
    }
  }

  async read(
    _entity: string,
    id: string,
    sources: BindingSource[],
  ): Promise<StoredRecord | null> {
    const found = this.records.get(id)
    if (!found) return null
    const values: Record<string, StoreValue> = {}
    for (const source of sources) {
      values[source.attribute] = found.values[source.attribute] ?? null
    }
    return { values, etag: String(found.version) }
  }

  async write(
    _entity: string,
    id: string,
    changes: Change[],
    etag: string,
  ): Promise<void> {
    const found = this.records.get(id)
    if (!found || String(found.version) !== etag) {
      throw new ConcurrentUpdateError()
    }
    for (const change of changes) {
      found.values[change.source.attribute] = change.value
    }
    found.version += 1
  }

  async lookupOptions(target: string): Promise<BindingOptions> {
    if (!this.privileges.readableTargets.has(target) || !FAKE_OPTIONS[target]) {
      return { options: [], source: "unavailable" }
    }
    return { options: FAKE_OPTIONS[target], source: "live" }
  }

  async describe(_entity: string, attributes: string[]): Promise<AttributeMetadata[]> {
    return FAKE_CONTACT_METADATA.filter((m) => attributes.includes(m.attribute))
  }

  async permissions(_entity: string, targets: string[]): Promise<ServicePermissions> {
    // The fake keeps it simple: an account that can write can link, and
    // any list it can read can be linked to.
    const readable = Object.fromEntries(
      targets.map((t) => [t, this.privileges.readableTargets.has(t)]),
    )
    return {
      readEntity: true,
      writeEntity: this.privileges.writeEntity,
      appendEntity: this.privileges.writeEntity,
      readTargets: readable,
      appendToTargets: readable,
    }
  }
}
