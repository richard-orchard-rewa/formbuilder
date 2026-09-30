import type { BindingDescriptor, CaseContext, SessionAnchor } from "shared"
import { TEMPLATES } from "./seed/modules"
import { bindingGroups, changesFor, instancesFor } from "./session-note"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const taylor = { id: id(4), clientNumber: "00152096", displayName: "Taylor Hawkins" }
const adam = { id: id(6), clientNumber: "00152097", displayName: "Adam Hawkins" }

const SESSION: SessionAnchor = {
  id: id(1),
  subject: "Session 3 · Taylor & Adam Hawkins",
  start: "2026-09-29T02:30:00.000Z",
  end: "2026-09-29T03:30:00.000Z",
  participants: [
    { id: id(3), client: taylor, attendance: "Invited" },
    { id: id(5), client: adam, attendance: "Invited" },
  ],
}

const CASE: CaseContext = {
  id: id(2),
  caseNumber: "104872",
  displayName: "Hawkins — Couples counselling",
  clients: [taylor, adam],
  sessions: [SESSION],
}

const descriptor = (key: string, access: "read" | "readWrite" = "readWrite") =>
  ({ key, access }) as BindingDescriptor

const DICTIONARY = new Map(
  [
    descriptor("session.subject", "read"),
    descriptor("session.setting"),
    descriptor("case.stage"),
    descriptor("case.caseNumber", "read"),
    descriptor("client.firstName"),
    descriptor("participant.attendance"),
  ].map((d) => [d.key, d]),
)

const counselling = TEMPLATES.find((t) => t.id === "counselling")!
const groupsOf = () => bindingGroups(instancesFor(counselling, SESSION), SESSION, CASE, DICTIONARY)

describe("a session note's modules", () => {
  it("repeats client and participant modules per participant, once each for case and session", () => {
    const keys = instancesFor(counselling, SESSION).map((i) => i.key)
    expect(keys).toContain("case-details")
    expect(keys).toContain("session-details")
    expect(keys.filter((k) => k.startsWith("attendance:"))).toEqual(["attendance:00152096", "attendance:00152097"])
    expect(keys.filter((k) => k.startsWith("client-details:"))).toHaveLength(2)
  })

  it("groups bound fields by the one anchor each reads and writes", () => {
    const groups = groupsOf()
    expect(groups.map((g) => [g.label, g.anchor])).toEqual([
      ["Session", { session: id(1) }],
      ["Taylor Hawkins · attendance", { participant: id(3) }],
      ["Adam Hawkins · attendance", { participant: id(5) }],
      ["Case", { case: id(2) }],
      ["Taylor Hawkins · client record", { client: id(4) }],
      ["Adam Hawkins · client record", { client: id(6) }],
    ])
    // Bindings the DBS doesn't publish are left out, not requested.
    expect(groups.find((g) => g.label === "Case")!.bindings).toEqual(["case.caseNumber", "case.stage"])
  })

  it("commits only the writable values that changed", () => {
    const session = groupsOf().find((g) => g.label === "Session")!
    const baseline = { "session.subject": "Session 3", "session.setting": "centre-based" }
    expect(
      changesFor(session, DICTIONARY, { "session.subject": "Edited", "session.setting": "telephone" }, baseline),
    ).toEqual({ "session.setting": "telephone" })
    expect(changesFor(session, DICTIONARY, { ...baseline, "session.setting": "  " }, baseline)).toEqual({
      "session.setting": null,
    })
  })
})
