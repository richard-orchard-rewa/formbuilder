import type { BindingOptions } from "shared"
import {
  choiceTarget,
  ConcurrentUpdateError,
  isChoiceTarget,
  type AttributeMetadata,
  type BindingSource,
  type Change,
  type ClientSummary,
  type RecordStore,
  type ServicePermissions,
  type SessionSummary,
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
export const FAKE_CLIENT_2_ID = "00000000-0000-0000-0000-000000152099"
export const FAKE_SESSION_ID = "00000000-0000-0000-0000-00000000a001"
export const FAKE_ATTENDANCE_IDS = [
  "00000000-0000-0000-0000-00000000b001",
  "00000000-0000-0000-0000-00000000b002",
] as const
export const ATTENDANCE_TARGET = choiceTarget("csg_attendance", "wp_attendancestatus")

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
  [ATTENDANCE_TARGET]: [
    { value: "1", label: "Invited" },
    { value: "2", label: "DNA" },
    { value: "4", label: "Attended" },
  ],
  csg_gender: [
    { value: "7c1c5d2e-0000-4000-8000-000000000001", label: "Female" },
    { value: "7c1c5d2e-0000-4000-8000-000000000002", label: "Male" },
    { value: "7c1c5d2e-0000-4000-8000-000000000003", label: "Non-binary" },
    { value: "7c1c5d2e-0000-4000-8000-000000000004", label: "Not stated" },
  ],
}

// An in-memory store so development, unit tests and e2e run without ICIS.
// Seeded with a stand-in for the test-ICIS contact the prototype uses, a
// second client, and a joint session both attended. The account's
// privileges are adjustable so the creator's ceilings can be exercised; by
// default it may do everything except read the language list.
export class FakeRecordStore implements RecordStore {
  readonly name = "fake"
  private readonly records = new Map<
    string,
    { entity: string; values: Record<string, StoreValue>; version: number }
  >()

  constructor(
    public privileges: {
      writeEntity: boolean
      readableTargets: Set<string>
    } = { writeEntity: true, readableTargets: new Set(["csg_salutation", "csg_gender"]) },
  ) {
    const add = (entity: string, id: string, values: Record<string, StoreValue>) =>
      this.records.set(id, { entity, values, version: 1 })
    add("contact", FAKE_CLIENT_ID, {
      csg_clientid: "00152076",
      csg_salutationid: KNOWN_TITLES[1].value,
      firstname: "Bob",
      lastname: "McGee",
      middlename: null,
      csg_alias: "Bobby",
      mobilephone: null,
    })
    add("contact", FAKE_CLIENT_2_ID, {
      csg_clientid: "00152099",
      csg_salutationid: KNOWN_TITLES[3].value,
      firstname: "Alex",
      lastname: "Rivera",
      csg_alias: null,
    })
    add("wp_session", FAKE_SESSION_ID, {
      subject: "Joint session",
      scheduledstart: "2026-10-06T02:00:00Z",
      scheduledend: "2026-10-06T04:00:00Z",
    })
    add("csg_attendance", FAKE_ATTENDANCE_IDS[0], {
      csg_sessionid: FAKE_SESSION_ID,
      csg_contactid: FAKE_CLIENT_ID,
      wp_attendancestatus: "4",
    })
    add("csg_attendance", FAKE_ATTENDANCE_IDS[1], {
      csg_sessionid: FAKE_SESSION_ID,
      csg_contactid: FAKE_CLIENT_2_ID,
      wp_attendancestatus: "1",
    })
  }

  private rows(entity: string) {
    return [...this.records].filter(([, r]) => r.entity === entity)
  }

  private byClientNumber(clientNumber: string) {
    for (const [id, record] of this.rows("contact")) {
      if (record.values.csg_clientid === clientNumber) return { id, record }
    }
    return null
  }

  private summary(id: string): ClientSummary {
    const values = this.records.get(id)?.values ?? {}
    return {
      id,
      clientNumber: values.csg_clientid ?? null,
      firstName: values.firstname ?? null,
      lastName: values.lastname ?? null,
    }
  }

  async sessionsForClient(clientId: string): Promise<SessionSummary[]> {
    const attendances = this.rows("csg_attendance")
    const labels = new Map(FAKE_OPTIONS[ATTENDANCE_TARGET].map((o) => [o.value, o.label]))
    const sessionIds = new Set(
      attendances
        .filter(([, a]) => a.values.csg_contactid === clientId)
        .map(([, a]) => a.values.csg_sessionid),
    )
    return this.rows("wp_session")
      .filter(([id]) => sessionIds.has(id))
      .map(([id, session]) => ({
        id,
        subject: session.values.subject ?? null,
        start: session.values.scheduledstart ?? null,
        end: session.values.scheduledend ?? null,
        participants: attendances
          .filter(([, a]) => a.values.csg_sessionid === id)
          .map(([attendanceId, a]) => ({
            id: attendanceId,
            client: this.summary(String(a.values.csg_contactid)),
            attendanceLabel: labels.get(String(a.values.wp_attendancestatus)) ?? null,
          })),
      }))
      .sort((a, b) => String(b.start).localeCompare(String(a.start)))
  }

  async findClientByNumber(clientNumber: string): Promise<ClientSummary | null> {
    const found = this.byClientNumber(clientNumber)
    return found ? this.summary(found.id) : null
  }

  async read(
    entity: string,
    id: string,
    sources: BindingSource[],
  ): Promise<StoredRecord | null> {
    const found = this.records.get(id)
    if (!found || found.entity !== entity) return null
    const values: Record<string, StoreValue> = {}
    for (const source of sources) {
      values[source.attribute] = found.values[source.attribute] ?? null
    }
    return { values, etag: String(found.version) }
  }

  async write(
    entity: string,
    id: string,
    changes: Change[],
    etag: string,
  ): Promise<void> {
    const found = this.records.get(id)
    if (!found || found.entity !== entity || String(found.version) !== etag) {
      throw new ConcurrentUpdateError()
    }
    for (const change of changes) {
      found.values[change.source.attribute] = change.value
    }
    found.version += 1
  }

  async lookupOptions(target: string): Promise<BindingOptions> {
    // An option set's values are metadata: always readable.
    if (isChoiceTarget(target)) return { options: FAKE_OPTIONS[target] ?? [], source: "live" }
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
