import type { BindingDescriptor, SessionContext } from "shared"
import { TEMPLATES } from "./seed/modules"
import { bindingGroups, changesFor, instancesFor } from "./session-note"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const SESSION: SessionContext = {
  id: id(1),
  subject: "Session 3 · Taylor & Adam Hawkins",
  scheduledStart: "2026-09-29T02:30:00.000Z",
  status: "scheduled",
  case: { id: id(2), caseNumber: "104872", displayName: "Hawkins — Couples counselling" },
  participants: [
    { id: id(3), client: { id: id(4), clientNumber: "00152096", displayName: "Taylor Hawkins" } },
    { id: id(5), client: { id: id(6), clientNumber: "00152097", displayName: "Adam Hawkins" } },
  ],
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
    descriptor("sessionParticipant.attendance"),
  ].map((d) => [d.key, d]),
)

const counselling = TEMPLATES.find((t) => t.id === "counselling")!

describe("a session note's modules", () => {
  it("repeats client and participant modules per client, once each for case and session", () => {
    const keys = instancesFor(counselling, SESSION).map((i) => i.key)
    expect(keys).toContain("case-details")
    expect(keys).toContain("session-details")
    expect(keys.filter((k) => k.startsWith("attendance:"))).toEqual(["attendance:00152096", "attendance:00152097"])
    expect(keys.filter((k) => k.startsWith("client-details:"))).toHaveLength(2)
  })

  it("resolves case and session together, and each person's client record with their attendance", () => {
    const groups = bindingGroups(instancesFor(counselling, SESSION), DICTIONARY)
    const shared = groups.find((g) => g.id === "shared")!
    expect(shared.anchor).toEqual({ session: id(1), case: id(2) })
    expect(shared.bindings).toEqual(["session.subject", "session.setting", "case.caseNumber", "case.stage"])
    const taylor = groups.find((g) => g.label === "Taylor Hawkins")!
    expect(taylor.anchor).toEqual({ sessionParticipant: id(3), client: id(4) })
    // Bindings the DBS doesn't publish are left out, not requested.
    expect(taylor.bindings).toEqual(["sessionParticipant.attendance", "client.firstName"])
  })

  it("commits only the writable values that changed", () => {
    const [shared] = bindingGroups(instancesFor(counselling, SESSION), DICTIONARY)
    const baseline = { "session.subject": "Session 3", "session.setting": "centre-based", "case.stage": "service-delivery" }
    expect(
      changesFor(shared, DICTIONARY, { ...baseline, "session.subject": "Edited", "session.setting": "telephone" }, baseline),
    ).toEqual({ "session.setting": "telephone" })
    expect(changesFor(shared, DICTIONARY, { ...baseline, "case.stage": "  " }, baseline)).toEqual({ "case.stage": null })
  })
})
