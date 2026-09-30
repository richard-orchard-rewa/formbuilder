import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type {
  AnchorContext,
  BindingDescriptor,
  BoundValues,
  Field,
  SessionAnchor,
  SessionTemplateVersion,
} from "shared"
import * as api from "./api.js"
import { SessionTemplateFill } from "./SessionTemplateFill.js"
import { SessionTemplateSubmissionView } from "./SessionTemplateSubmissionView.js"

const SESSION = "11111111-1111-4111-8111-111111111111"
const AISHA = { participant: "22222222-2222-4222-8222-222222222222", client: "33333333-3333-4333-8333-333333333333" }
const TARIQ = { participant: "44444444-4444-4444-8444-444444444444", client: "55555555-5555-4555-8555-555555555555" }

const preferredName: BindingDescriptor = {
  key: "client.preferredName",
  version: 1,
  label: "Preferred name",
  description: "",
  anchor: "client",
  access: "readWrite",
  control: { kind: "text" },
  overridable: ["label"],
}

const participantFields: Field[] = [
  { id: "preferred", type: "bound", label: "Preferred name", required: false, binding: preferredName },
  { id: "progress", type: "textarea", label: "Progress", required: false },
]
const sessionFields: Field[] = [
  { id: "summary", type: "textarea", label: "Summary", required: false },
]

const version: SessionTemplateVersion = {
  id: "v1",
  sessionTemplateId: "t1",
  version: 1,
  modules: [],
  schema: {
    fields: [...sessionFields, ...participantFields],
    sections: [
      { moduleId: "m1", moduleName: "Session details", scope: "session", fields: sessionFields },
      { moduleId: "m2", moduleName: "Each person", scope: "participant", fields: participantFields },
    ],
  },
  status: "published",
  createdAt: "2026-09-01T00:00:00.000Z",
  publishedAt: "2026-09-01T00:00:00.000Z",
  publishedBy: null,
}

const session: SessionAnchor = {
  id: SESSION,
  subject: "Joint mediation session",
  start: "2026-10-06T02:00:00Z",
  end: null,
  participants: [
    { id: AISHA.participant, attendance: "Attended", client: { id: AISHA.client, clientNumber: "00152077", displayName: "Aisha Rahimi" } },
    { id: TARIQ.participant, attendance: "Attended", client: { id: TARIQ.client, clientNumber: "00152082", displayName: "Tariq Haddad" } },
  ],
}

// Each client's preferred name, by their DBS client anchor.
const PREFERRED: Record<string, string> = { [AISHA.client]: "Aisha", [TARIQ.client]: "Taz" }

describe("SessionTemplateFill with participant sections", () => {
  it("fills a copy per participant from their own record, and submits each under their participant anchor", async () => {
    vi.spyOn(api, "getSessionTemplateActiveVersion").mockResolvedValue(version)
    vi.spyOn(api, "findSessions").mockResolvedValue([session])
    vi.spyOn(api, "resolveBindings").mockImplementation(async (anchor: AnchorContext) => {
      const values: BoundValues =
        "client" in anchor ? { "client.preferredName": PREFERRED[anchor.client] } : {}
      return { values, resolvedAt: "2026-10-06T00:00:00.000Z" }
    })
    const submit = vi.spyOn(api, "submitSessionTemplate").mockResolvedValue({
      id: "sub-1",
      sessionTemplateId: "t1",
      sessionTemplateVersionId: "v1",
      data: {},
      submittedBy: null,
      submittedAt: "2026-10-06T00:00:00.000Z",
      bindingResults: {
        participants: {
          [TARIQ.participant]: { "client.preferredName": { status: "written" } },
        },
      },
    })
    const user = userEvent.setup()
    render(<SessionTemplateFill sessionTemplateId="t1" sessionTemplateName="Joint note" onBack={() => {}} />)

    expect(await screen.findByText(/Choose a session to fill this in/)).toBeInTheDocument()
    await user.type(screen.getByLabelText("ICIS client number"), "00152077")
    await user.click(screen.getByRole("button", { name: "Find sessions" }))
    await user.click(await screen.findByRole("button", { name: /Joint mediation session/ }))

    const aisha = await screen.findByRole("region", { name: "Each person — Aisha Rahimi" })
    const tariq = screen.getByRole("region", { name: "Each person — Tariq Haddad" })
    // Each copy is prefilled from that person's own client record.
    expect(within(aisha).getByLabelText("Preferred name")).toHaveValue("Aisha")
    expect(within(tariq).getByLabelText("Preferred name")).toHaveValue("Taz")

    await user.type(within(tariq).getByLabelText("Progress"), "Engaged")
    // JSON Forms reports changes from an effect; let the typing land first.
    await waitFor(() => expect(within(tariq).getByLabelText("Progress")).toHaveValue("Engaged"))
    await new Promise((resolve) => setTimeout(resolve, 50))
    await user.click(screen.getByRole("button", { name: "Submit" }))

    await waitFor(() => expect(submit).toHaveBeenCalled())
    const [, data, binding] = submit.mock.calls[0]
    expect(data.participants).toEqual({
      [AISHA.participant]: { preferred: "Aisha" },
      [TARIQ.participant]: { preferred: "Taz", progress: "Engaged" },
    })
    expect(binding).toMatchObject({
      session: SESSION,
      participants: [AISHA, TARIQ],
      baseline: {
        participants: {
          [TARIQ.participant]: { client: { "client.preferredName": "Taz" } },
        },
      },
    })
    // What came back is shown against the right person.
    expect(await screen.findByRole("region", { name: "Tariq Haddad updates" })).toHaveTextContent(
      "Saved to ICIS",
    )
  })
})

describe("SessionTemplateSubmissionView with participant sections", () => {
  it("reads each participant's copy back and labels it with who that participant is", async () => {
    vi.spyOn(api, "getSessionTemplateSubmission").mockResolvedValue({
      id: "sub-1",
      sessionTemplateId: "t1",
      sessionTemplateVersionId: "v1",
      sessionTemplateVersionNumber: 1,
      schema: version.schema,
      submittedBy: null,
      submittedAt: "2026-10-06T00:00:00.000Z",
      data: {
        summary: "Both attended",
        participants: {
          [AISHA.participant]: { progress: "Calm" },
          [TARIQ.participant]: { progress: "Engaged" },
        },
      },
    })
    vi.spyOn(api, "getParticipant").mockImplementation(async (id) => {
      const p = session.participants.find((x) => x.id === id)
      return p ?? null
    })
    render(
      <SessionTemplateSubmissionView
        sessionTemplateId="t1"
        sessionTemplateName="Joint note"
        submissionId="sub-1"
        onBack={() => {}}
      />,
    )
    const aisha = await screen.findByRole("region", { name: "Each person — Aisha Rahimi" })
    const tariq = screen.getByRole("region", { name: "Each person — Tariq Haddad" })
    expect(within(aisha).getByLabelText("Progress")).toHaveValue("Calm")
    expect(within(tariq).getByLabelText("Progress")).toHaveValue("Engaged")
  })
})
