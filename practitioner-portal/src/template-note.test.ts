import type { Field, SessionAnchor, SessionTemplateSection } from "shared"
import { describe, expect, it } from "vitest"
import { defaultsFor, missingRequired, sectionsOf, submissionData } from "./template-note"

const text = (id: string, required = false): Field => ({ id, type: "text", label: id, required })

const session = {
  id: "s1",
  subject: "Session 3",
  start: null,
  participants: [
    { id: "p1", client: { id: "c1", displayName: "Taylor Hawkins", clientNumber: "1" } },
    { id: "p2", client: { id: "c2", displayName: "Adam Hawkins", clientNumber: "2" } },
  ],
} as unknown as SessionAnchor

const sections: SessionTemplateSection[] = [
  { moduleId: "m1", moduleName: "Session summary", scope: "session", fields: [text("summary", true)] },
  { moduleId: "m2", moduleName: "Wellbeing", scope: "participant", fields: [text("mood", true), text("notes")] },
]

describe("template note", () => {
  it("fills as one session section when a template has no sections", () => {
    const fields = [text("a")]
    expect(sectionsOf({ fields })).toEqual([{ moduleId: "all", moduleName: "", scope: "session", fields }])
  })

  it("starts dropdowns, radios and checkboxes on their defaults", () => {
    const fields: Field[] = [
      { id: "d", type: "dropdown", label: "d", required: false, options: [], defaultValue: "x" },
      { id: "c", type: "checkbox", label: "c", required: false, defaultChecked: true },
      text("t"),
    ]
    expect(defaultsFor(fields)).toEqual({ d: "x", c: true })
  })

  it("names each participant's missing required answers separately", () => {
    const missing = missingRequired(sections, { summary: "ok" }, { p1: { mood: "fine" } }, session)
    expect(missing).toEqual(["Wellbeing: mood (Adam Hawkins)"])
  })

  it("holds participant answers under their participant anchor", () => {
    const data = submissionData(sections, { summary: "ok" }, { p1: { mood: "fine" } }, session)
    expect(data).toEqual({ summary: "ok", participants: { p1: { mood: "fine" }, p2: {} } })
  })

  it("leaves out participants when the template has no participant section", () => {
    expect(submissionData([sections[0]], { summary: "ok" }, {}, session)).toEqual({ summary: "ok" })
  })
})
