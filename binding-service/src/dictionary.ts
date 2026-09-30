import type { BindingDescriptor } from "shared"
import { choiceTarget, type BindingSource } from "./adapters/adapter.js"

export interface DictionaryEntry {
  descriptor: BindingDescriptor
  source: BindingSource
}

// Bindings defined in code (requirements §7). Stewards add more through the
// binding creator (see registry.ts); these are the ones the prototype
// started with, kept in code so they can't be edited out from under forms.
// Keys are store-agnostic; `source` is the only ICIS-specific part.
const sessionRead = (
  key: string,
  label: string,
  attribute: string,
  description: string,
): DictionaryEntry => ({
  source: { strategy: "attribute", entity: "wp_session", attribute },
  descriptor: {
    key,
    version: 1,
    label,
    description,
    anchor: "session",
    access: "read",
    control: { kind: "text" },
    overridable: ["label"],
  },
})

// A built-in binding on any anchor, for the case and session details a
// session note shows and keeps current.
const entry = (
  key: string,
  label: string,
  description: string,
  access: "read" | "readWrite",
  source: BindingSource,
): DictionaryEntry => ({
  source,
  descriptor: {
    key,
    version: 1,
    label,
    description,
    anchor: key.split(".")[0] as BindingDescriptor["anchor"],
    access,
    control: source.strategy === "attribute" ? { kind: "text" } : { kind: "lookup" },
    overridable: access === "read" ? ["label"] : ["label", "required"],
  },
})

export const CODE_BINDINGS: DictionaryEntry[] = [  {
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
  // Session details from the booking: display only (requirements §8 --
  // referenced values are shown, not re-entered).
  sessionRead("session.subject", "Session", "subject", "The session's subject, from the booking."),
  sessionRead("session.start", "Start", "scheduledstart", "When the session starts, from the booking."),
  sessionRead("session.end", "End", "scheduledend", "When the session ends, from the booking."),
  // One person's attendance at the session -- data about the participant
  // in this session, not about the client in general.
  {
    source: {
      strategy: "choice",
      entity: "csg_attendance",
      attribute: "wp_attendancestatus",
      target: choiceTarget("csg_attendance", "wp_attendancestatus"),
    },
    descriptor: {
      key: "participant.attendance",
      version: 1,
      label: "Attendance",
      description: "Whether this participant attended the session.",
      anchor: "participant",
      access: "readWrite",
      control: { kind: "lookup" },
      overridable: ["label", "required"],
    },
  },
  // How the session was booked and delivered: its type from the booking
  // (display only), its setting confirmed in the note.
  entry("session.sessionType", "Session type", "Intake, counselling session or case review, as booked.", "read",
    { strategy: "lookup", entity: "wp_session", attribute: "csg_sessiontypeid", target: "csg_sessiontype" }),
  entry("session.setting", "Session setting", "How and where the session was delivered.", "readWrite",
    { strategy: "lookup", entity: "wp_session", attribute: "csg_sessionsettingid", target: "csg_sessionsetting" }),
  // The case (an incident). Its identity and programme are set when it's
  // opened in ICIS, so display only; the practitioner keeps its referral
  // source and stage current from their notes.
  entry("case.caseNumber", "Case number", "The case's ICIS case number. Display only.", "read",
    { strategy: "attribute", entity: "incident", attribute: "ticketnumber" }),
  entry("case.program", "Program", "The service program the case is delivered under.", "read",
    { strategy: "lookup", entity: "incident", attribute: "csg_programid", target: "csg_program" }),
  entry("case.location", "Location", "The RAWA location delivering the case.", "read",
    { strategy: "lookup", entity: "incident", attribute: "csg_locationid", target: "csg_location" }),
  entry("case.referralSource", "Referral source", "Who referred the client(s) to the service.", "readWrite",
    { strategy: "lookup", entity: "incident", attribute: "csg_referralsourceid", target: "csg_referralsource" }),
  entry("case.stage", "Case stage", "Where the case is: intake, service delivery, case review or closure.", "readWrite",
    { strategy: "choice", entity: "incident", attribute: "csg_casestage", target: choiceTarget("incident", "csg_casestage") }),
]