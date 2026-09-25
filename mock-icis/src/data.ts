// Seed data for the mock ICIS: made-up but representative of test ICIS's
// shape (table and column names, lengths and lookup structure as probed on
// 2026-09-25). No real client data. Mobile numbers are from ACMA's range
// reserved for fictional use (0491 57x xxx) and landlines from the
// (08) 5550 xxxx drama range; emails use example.com.

export type AttributeType = "String" | "Lookup" | "DateTime"

export interface AttributeDef {
  logicalName: string
  displayName: string
  type: AttributeType
  maxLength?: number
  target?: string
  requiredLevel: "None" | "Recommended" | "ApplicationRequired"
  validForUpdate: boolean
  // Shown in the mock's admin UI to make the allow-list's point: the store
  // would let a binding update these, the Data Binding Service won't.
  sensitive?: string
}

export interface EntityDef {
  logicalName: string
  displayName: string
  entitySet: string
  primaryId: string
  primaryName: string
  // Dataverse privilege names by type, as `EntityDefinitions` reports them.
  privileges: Partial<Record<"Read" | "Write" | "Append" | "AppendTo", string>>
  attributes: AttributeDef[]
}

const lookupTable = (
  logicalName: string,
  displayName: string,
  schemaName: string,
): EntityDef => ({
  logicalName,
  displayName,
  entitySet: `${logicalName}s`,
  primaryId: `${logicalName}id`,
  primaryName: "csg_name",
  privileges: {
    Read: `prvRead${schemaName}`,
    Write: `prvWrite${schemaName}`,
    Append: `prvAppend${schemaName}`,
    AppendTo: `prvAppendTo${schemaName}`,
  },
  attributes: [],
})

const text = (
  logicalName: string,
  displayName: string,
  maxLength: number,
  extra: Partial<AttributeDef> = {},
): AttributeDef => ({
  logicalName,
  displayName,
  type: "String",
  maxLength,
  requiredLevel: "None",
  validForUpdate: true,
  ...extra,
})

const lookup = (logicalName: string, displayName: string, target: string): AttributeDef => ({
  logicalName,
  displayName,
  type: "Lookup",
  target,
  requiredLevel: "None",
  validForUpdate: true,
})

export const CONTACT: EntityDef = {
  logicalName: "contact",
  displayName: "Contact",
  entitySet: "contacts",
  primaryId: "contactid",
  primaryName: "fullname",
  privileges: {
    Read: "prvReadContact",
    Write: "prvWriteContact",
    Append: "prvAppendContact",
    AppendTo: "prvAppendToContact",
  },
  attributes: [
    text("csg_clientid", "Contact ID", 100),
    lookup("csg_salutationid", "Title", "csg_salutation"),
    text("firstname", "First Name", 50, { requiredLevel: "Recommended" }),
    text("middlename", "Middle Name", 50),
    text("lastname", "Last Name", 50, { requiredLevel: "Recommended" }),
    text("csg_alias", "Preferred Name", 100),
    lookup("csg_genderid", "Gender", "csg_gender"),
    text("rawa_preferredgender", "Preferred Gender Term", 100),
    lookup("csg_home_languageid", "Home Language", "csg_language"),
    text("mobilephone", "Mobile Phone", 50),
    text("telephone2", "Home Phone", 50),
    text("emailaddress1", "Email", 100),
    {
      logicalName: "birthdate",
      displayName: "Birthday",
      type: "DateTime",
      requiredLevel: "None",
      validForUpdate: true,
    },
    text("address1_city", "Address 1: City", 80),
    text("address1_postalcode", "Address 1: ZIP/Postal Code", 20),
    text("csg_dssid", "DSS Client ID", 100, {
      sensitive: "DEX identifier — reported to DSS",
    }),
    text("csg_health_care_card_id", "Health Care Card ID", 100, {
      sensitive: "Government identifier",
    }),
    text("csg_slk", "SLK", 100, { sensitive: "Statistical linkage key" }),
    text("adx_identity_passwordhash", "Password Hash", 128, {
      sensitive: "Portal credential",
    }),
  ],
}

export const LOOKUP_TABLES: EntityDef[] = [
  lookupTable("csg_salutation", "Salutation", "Csg_salutation"),
  lookupTable("csg_gender", "Gender", "Csg_gender"),
  lookupTable("csg_language", "Language", "Csg_language"),
]

export const SYSTEMUSER: EntityDef = {
  logicalName: "systemuser",
  displayName: "User",
  entitySet: "systemusers",
  primaryId: "systemuserid",
  primaryName: "fullname",
  privileges: { Read: "prvReadUser", Write: "prvWriteUser" },
  attributes: [],
}

export const ENTITIES: EntityDef[] = [CONTACT, ...LOOKUP_TABLES, SYSTEMUSER]

export interface LookupRow {
  id: string
  name: string
}

const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`

// The first five salutation IDs are the ones observed in test ICIS, so the
// Data Binding Service's built-in fallback list lines up with the mock.
export const LOOKUP_ROWS: Record<string, LookupRow[]> = {
  csg_salutation: [
    { id: "898b6ce9-e68f-df11-aff9-0050569f692b", name: "Miss" },
    { id: "8a8b6ce9-e68f-df11-aff9-0050569f692b", name: "Mr" },
    { id: "8b8b6ce9-e68f-df11-aff9-0050569f692b", name: "Mrs" },
    { id: "8c8b6ce9-e68f-df11-aff9-0050569f692b", name: "Ms" },
    { id: "c286e810-bdfe-df11-93cd-005056890003", name: "Not Stated" },
    { id: id("de301000", 1), name: "Mx" },
    { id: id("de301000", 2), name: "Dr" },
  ],
  csg_gender: [
    { id: id("de302000", 1), name: "Female" },
    { id: id("de302000", 2), name: "Male" },
    { id: id("de302000", 3), name: "Non-binary" },
    { id: id("de302000", 4), name: "Different term" },
    { id: id("de302000", 5), name: "Prefer not to say" },
  ],
  csg_language: [
    "English", "Arabic", "Auslan", "Cantonese", "Dari", "Greek", "Hindi",
    "Italian", "Mandarin", "Punjabi", "Swahili", "Tagalog", "Vietnamese",
  ].map((name, i) => ({ id: id("de303000", i + 1), name })),
}

const ref = (table: string, name: string | null) =>
  name === null ? null : LOOKUP_ROWS[table].find((r) => r.name === name)!.id

// Mobile numbers from ACMA's fictional-use range.
const MOBILES = [
  "0491 570 006", "0491 570 156", "0491 570 157", "0491 570 158",
  "0491 570 159", "0491 570 110", "0491 570 313", "0491 570 737",
  "0491 571 266", "0491 571 491", "0491 571 804", "0491 572 549",
  "0491 572 665", "0491 572 983", "0491 573 770", "0491 573 087",
]

interface Seed {
  number: string
  title: string
  first: string
  middle?: string
  last: string
  preferred?: string
  gender: string | null
  preferredGender?: string
  language: string
  birthdate: string
  city: string
  postcode: string
  email?: boolean
  home?: boolean
}

const SEEDS: Seed[] = [
  { number: "00152076", title: "Mr", first: "Bob", last: "McGee", gender: "Male", language: "English", birthdate: "1978-04-12", city: "Joondalup", postcode: "6027", email: true },
  { number: "00152077", title: "Ms", first: "Aisha", last: "Rahimi", gender: "Female", language: "Dari", birthdate: "1990-11-03", city: "Mirrabooka", postcode: "6061" },
  { number: "00152078", title: "Mr", first: "Minh", last: "Tran", preferred: "Tony", gender: "Male", language: "Vietnamese", birthdate: "1985-02-27", city: "Girrawheen", postcode: "6064", home: true },
  { number: "00152079", title: "Mrs", first: "Grace", last: "O'Connor", gender: "Female", language: "English", birthdate: "1972-08-19", city: "Bunbury", postcode: "6230", email: true, home: true },
  { number: "00152080", title: "Mx", first: "Jordan", last: "Blake", preferred: "Jo", gender: "Non-binary", language: "English", birthdate: "1999-06-30", city: "Fremantle", postcode: "6160", email: true },
  { number: "00152081", title: "Ms", first: "Mei Lin", last: "Chen", gender: "Female", language: "Mandarin", birthdate: "1988-01-15", city: "Cannington", postcode: "6107" },
  { number: "00152082", title: "Mr", first: "Tariq", last: "Haddad", gender: "Male", language: "Arabic", birthdate: "1981-09-09", city: "Balga", postcode: "6061", email: true },
  { number: "00152083", title: "Miss", first: "Sophie", last: "Nguyen", preferred: "Soph", gender: "Female", language: "Vietnamese", birthdate: "2003-12-01", city: "Midland", postcode: "6056" },
  { number: "00152084", title: "Mr", first: "Liam", middle: "Patrick", last: "Walker", gender: "Male", language: "English", birthdate: "1994-03-22", city: "Kalgoorlie", postcode: "6430", home: true },
  { number: "00152085", title: "Ms", first: "Amani", last: "Mwangi", gender: "Female", language: "Swahili", birthdate: "1992-07-07", city: "Rockingham", postcode: "6168", email: true },
  { number: "00152086", title: "Mr", first: "Giuseppe", last: "Romano", preferred: "Joe", gender: "Male", language: "Italian", birthdate: "1959-05-18", city: "Osborne Park", postcode: "6017", home: true },
  { number: "00152087", title: "Mrs", first: "Harpreet", last: "Kaur", gender: "Female", language: "Punjabi", birthdate: "1987-10-25", city: "Ellenbrook", postcode: "6069" },
  { number: "00152088", title: "Dr", first: "Daniel", last: "Kovac", gender: "Male", language: "English", birthdate: "1976-12-14", city: "Albany", postcode: "6330", email: true },
  { number: "00152089", title: "Ms", first: "Chloe", last: "Anderson", gender: null, language: "English", birthdate: "1996-04-04", city: "Mandurah", postcode: "6210" },
  { number: "00152090", title: "Mrs", first: "Eleni", last: "Papadopoulos", gender: "Female", language: "Greek", birthdate: "1968-02-02", city: "Victoria Park", postcode: "6100", home: true },
  { number: "00152091", title: "Mr", first: "Kai", middle: "James", last: "Thompson", gender: "Male", language: "English", birthdate: "2001-08-16", city: "Geraldton", postcode: "6530", email: true },
  { number: "00152092", title: "Ms", first: "Maria", last: "Santos", gender: "Female", language: "Tagalog", birthdate: "1983-11-28", city: "Armadale", postcode: "6112" },
  { number: "00152093", title: "Not Stated", first: "Sam", last: "Taylor", gender: "Different term", preferredGender: "Genderfluid", language: "English", birthdate: "1998-09-21", city: "Broome", postcode: "6725" },
  { number: "00152094", title: "Mr", first: "Rhys", last: "Williams", gender: "Male", language: "Auslan", birthdate: "1990-01-31", city: "Busselton", postcode: "6280", email: true },
  { number: "00152095", title: "Ms", first: "Fatima", last: "Yusuf", gender: "Prefer not to say", language: "Arabic", birthdate: "1979-06-11", city: "Morley", postcode: "6062" },
]

export interface ContactRow {
  contactid: string
  version: number
  modifiedOn: string
  modifiedBy: string
  values: Record<string, string | null>
}

// The contact ID the Data Binding Service's test fixtures and earlier
// demos use for Bob McGee in test ICIS, kept so the two line up.
const BOB_ID = "2c616f0e-d741-f011-8779-000d3ad0ea14"

export function seedContacts(): ContactRow[] {
  return SEEDS.map((s, i) => {
    const email = s.email
      ? `${s.first.toLowerCase().replace(/\s+/g, ".")}.${s.last.toLowerCase().replace(/'/g, "")}@example.com`
      : null
    return {
      contactid: s.number === "00152076" ? BOB_ID : `de300000-0000-4000-8000-0000${s.number}`,
      version: 1000 + i,
      modifiedOn: "2026-09-01T00:00:00.000Z",
      modifiedBy: "Data migration",
      values: {
        csg_clientid: s.number,
        csg_salutationid: ref("csg_salutation", s.title),
        firstname: s.first,
        middlename: s.middle ?? null,
        lastname: s.last,
        csg_alias: s.preferred ?? null,
        csg_genderid: ref("csg_gender", s.gender),
        rawa_preferredgender: s.preferredGender ?? null,
        csg_home_languageid: ref("csg_language", s.language),
        mobilephone: MOBILES[i % MOBILES.length],
        telephone2: s.home ? `(08) 5550 01${String(i).padStart(2, "0")}` : null,
        emailaddress1: email,
        birthdate: s.birthdate,
        address1_city: s.city,
        address1_postalcode: s.postcode,
        csg_dssid: `DSS${String(9_100_000 + i * 7919)}`,
        csg_health_care_card_id: i % 3 === 0 ? `${400 + i} ${100 + i * 3} ${210 + i}K` : null,
        csg_slk: `${s.last.slice(1, 4).toUpperCase().padEnd(3, "2")}${s.first.slice(1, 3).toUpperCase()}${s.birthdate.slice(8, 10)}${s.birthdate.slice(5, 7)}${s.birthdate.slice(0, 4)}${s.gender === "Female" ? 2 : 1}`,
        adx_identity_passwordhash:
          i % 4 === 0 ? `AQAAAAIAAYagAAAAE${Buffer.from(s.number).toString("base64")}FAKEHASH` : null,
      },
    }
  })
}

// The Data Binding Service's application user in the mock. It starts with
// the same shape of access the borrowed test-ICIS account has -- read
// contacts and titles, nothing else -- so the demo can grant more live.
export const SERVICE_ACCOUNT = {
  userId: "de309000-0000-4000-8000-000000000001",
  name: "Data Binding Service (demo)",
  token: "mock-icis-demo-token",
}

export const INITIAL_PRIVILEGES = [
  "prvReadContact",
  "prvReadCsg_salutation",
  "prvReadUser",
]
