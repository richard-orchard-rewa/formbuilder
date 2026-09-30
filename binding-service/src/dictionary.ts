import type { BindingDescriptor } from "shared"
import type { BindingSource } from "./adapters/adapter.js"

export interface DictionaryEntry {
  descriptor: BindingDescriptor
  source: BindingSource
}

// Bindings defined in code (requirements §7). Stewards add more through the
// binding creator (see registry.ts); these are the ones the prototype
// started with, kept in code so they can't be edited out from under forms.
// Keys are store-agnostic; `source` is the only ICIS-specific part.
export const CODE_BINDINGS: DictionaryEntry[] = [
  {
    source: {
      strategy: "lookup",
      entity: "contact",
      attribute: "csg_salutationid",
      target: "csg_salutation",
    },
    descriptor: {
      key: "client.title",
      version: 1,
      label: "Title",
      description: "The client's title (Mr, Ms, ...), from the salutation list.",
      anchor: "client",
      access: "readWrite",
      control: { kind: "lookup" },
      overridable: ["label", "required"],
    },
  },
  {
    source: { strategy: "attribute", entity: "contact", attribute: "firstname" },
    descriptor: {
      key: "client.firstName",
      version: 1,
      label: "First name",
      description: "The client's first (given) name.",
      anchor: "client",
      access: "readWrite",
      control: { kind: "text", maxLength: 50 },
      overridable: ["label", "required"],
    },
  },
  {
    source: { strategy: "attribute", entity: "contact", attribute: "lastname" },
    descriptor: {
      key: "client.lastName",
      version: 1,
      label: "Last name",
      description: "The client's last (family) name.",
      anchor: "client",
      access: "readWrite",
      control: { kind: "text", maxLength: 50 },
      overridable: ["label", "required"],
    },
  },
  {
    source: { strategy: "attribute", entity: "contact", attribute: "csg_clientid" },
    descriptor: {
      key: "client.clientNumber",
      version: 1,
      label: "Client number",
      description: "The client's ICIS client number. Display only.",
      anchor: "client",
      access: "read",
      control: { kind: "text" },
      overridable: ["label"],
    },
  },

  // --- Case (`incident`). The case's identity and service are set when
  // it's opened in ICIS, so display-only; the practitioner keeps its
  // referral source and stage current from their notes. ---
  entry("case", "caseNumber", "Case number", "The case's ICIS case number. Display only.", "read",
    { strategy: "attribute", entity: "incident", attribute: "ticketnumber" }),
  entry("case", "program", "Program", "The service program the case is delivered under.", "read",
    { strategy: "lookup", entity: "incident", attribute: "csg_programid", target: "csg_program" }),
  entry("case", "location", "Location", "The RAWA location delivering the case.", "read",
    { strategy: "lookup", entity: "incident", attribute: "csg_locationid", target: "csg_location" }),
  entry("case", "referralSource", "Referral source", "Who referred the client(s) to the service.", "readWrite",
    { strategy: "lookup", entity: "incident", attribute: "csg_referralsourceid", target: "csg_referralsource" }),
  entry("case", "stage", "Case stage", "Where the case is in the service: intake, delivery, review or closure.", "readWrite",
    { strategy: "choice", entity: "incident", attribute: "csg_casestage" }),

  // --- Session (`wp_session`). Its subject and type come from the
  // booking; how it was delivered is confirmed in the session note. ---
  entry("session", "subject", "Session", "The booked session's subject. Display only.", "read",
    { strategy: "attribute", entity: "wp_session", attribute: "subject" }),
  entry("session", "sessionType", "Session type", "Intake, counselling session or case review, as booked.", "read",
    { strategy: "lookup", entity: "wp_session", attribute: "csg_sessiontypeid", target: "csg_sessiontype" }),
  entry("session", "setting", "Session setting", "How and where the session was delivered.", "readWrite",
    { strategy: "lookup", entity: "wp_session", attribute: "csg_sessionsettingid", target: "csg_sessionsetting" }),

  // --- Session participant (`csg_attendance`): one per client booked into
  // a session. ---
  entry("sessionParticipant", "attendance", "Attendance", "Whether this client attended the session.", "readWrite",
    { strategy: "choice", entity: "csg_attendance", attribute: "wp_attendancestatus" }),
]

function entry(
  anchor: DictionaryEntry["descriptor"]["anchor"],
  name: string,
  label: string,
  description: string,
  access: "read" | "readWrite",
  source: BindingSource,
): DictionaryEntry {
  return {
    source,
    descriptor: {
      key: `${anchor}.${name}`,
      version: 1,
      label,
      description,
      anchor,
      access,
      control: source.strategy === "attribute" ? { kind: "text" } : { kind: "lookup" },
      overridable: access === "read" ? ["label"] : ["label", "required"],
    },
  }
}
