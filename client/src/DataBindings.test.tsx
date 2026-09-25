import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { AttributeCandidate, ManagedBinding } from "shared"
import * as api from "./api.js"
import { DataBindings } from "./DataBindings.js"

const candidate = (overrides: Partial<AttributeCandidate>): AttributeCandidate => ({
  attribute: "csg_alias",
  displayName: "Preferred Name",
  strategy: "attribute",
  maxLength: 100,
  storeRequired: false,
  lookupTarget: null,
  maxAccess: "readWrite",
  accessNotes: [],
  problems: [],
  boundBy: null,
  ...overrides,
})

const builtIn: ManagedBinding = {
  key: "client.firstName",
  origin: "code",
  attribute: "firstname",
  versions: [
    {
      version: 1,
      status: "published",
      createdAt: "1970-01-01T00:00:00.000Z",
      publishedAt: "1970-01-01T00:00:00.000Z",
      descriptor: {
        key: "client.firstName",
        version: 1,
        label: "First name",
        description: "",
        anchor: "client",
        access: "readWrite",
        control: { kind: "text", maxLength: 50 },
        overridable: ["label", "required"],
      },
    },
  ],
}

describe("DataBindings (binding creator)", () => {
  it("offers creation only where allowed, and says why access is capped", async () => {
    vi.spyOn(api, "listManagedBindings").mockResolvedValue([builtIn])
    vi.spyOn(api, "listBindingCandidates").mockResolvedValue([
      candidate({}),
      candidate({ attribute: "firstname", displayName: "First Name", boundBy: "client.firstName" }),
      candidate({
        attribute: "mobilephone",
        displayName: "Mobile Phone",
        maxAccess: "read",
        accessNotes: ["The Data Binding Service's ICIS account can't write client records."],
      }),
    ])
    render(<DataBindings onBack={() => {}} />)

    const table = await screen.findByRole("table", { name: "Available attributes" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(within(rows[0]).getByRole("button", { name: "Create binding" })).toBeInTheDocument()
    // Built-in bindings can't be re-versioned from here.
    expect(within(rows[1]).queryByRole("button")).toBeNull()
    expect(rows[2]).toHaveTextContent("can't write client records")
  })

  it("saves a draft with a suggested key, and shows the service's refusal verbatim", async () => {
    vi.spyOn(api, "listManagedBindings").mockResolvedValue([])
    vi.spyOn(api, "listBindingCandidates").mockResolvedValue([candidate({})])
    const save = vi
      .spyOn(api, "saveBindingDraft")
      .mockRejectedValue(
        new api.BindingRuleRejectedError(
          "ICIS allows at most 100 characters here; a binding can only narrow that.",
        ),
      )
    render(<DataBindings onBack={() => {}} />)

    await userEvent.click(await screen.findByRole("button", { name: "Create binding" }))
    const editor = screen.getByRole("form", { name: "Binding editor" })
    expect(within(editor).getByDisplayValue("client.preferredName")).toBeInTheDocument()
    await userEvent.click(within(editor).getByRole("button", { name: "Save draft" }))

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "client.preferredName",
        attribute: "csg_alias",
        access: "readWrite",
        maxLength: 100,
      }),
    )
    expect(await within(editor).findByRole("alert")).toHaveTextContent("at most 100")
  })
})
