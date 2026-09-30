import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FIELD_TYPE_LABELS, FIELD_TYPES, type BindingDescriptor } from "shared"
import { FieldPalette } from "./FieldPalette.js"

describe("FieldPalette", () => {
  it("lists every field type by its label", () => {
    render(<FieldPalette />)
    for (const type of FIELD_TYPES) {
      expect(
        screen.getByText(FIELD_TYPE_LABELS[type]),
      ).toBeInTheDocument()
    }
  })

  it("marks each palette item draggable so it can be dropped onto the canvas", () => {
    render(<FieldPalette />)
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(FIELD_TYPES.length)
    for (const item of items) {
      expect(item).toHaveAttribute("draggable", "true")
    }
  })

  it("lists the Data Binding Service's dictionary as draggable data-bound fields", () => {
    const binding = (
      key: string,
      label: string,
      access: BindingDescriptor["access"],
    ): BindingDescriptor => ({
      key,
      label,
      access,
      version: 1,
      description: "",
      anchor: "client",
      control: { kind: "text" },
      overridable: ["label"],
    })
    render(
      <FieldPalette
        bindings={{
          status: "ready",
          bindings: [
            binding("client.firstName", "First name", "readWrite"),
            binding("client.clientNumber", "Client number", "read"),
          ],
        }}
      />,
    )
    expect(screen.getByText("First name").closest("li")).toHaveAttribute(
      "draggable",
      "true",
    )
    expect(screen.getByText("Client number").closest("li")).toHaveTextContent(
      "Read-only",
    )
  })

  it("says so when the Data Binding Service is unavailable", () => {
    render(<FieldPalette bindings={{ status: "unavailable" }} />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "The Data Binding Service isn't available.",
    )
  })

  it("adds a field type when its item is clicked", async () => {
    const onAddType = vi.fn()
    render(<FieldPalette onAddType={onAddType} />)

    await userEvent.click(screen.getByRole("button", { name: "Add Date field" }))

    expect(onAddType).toHaveBeenCalledWith("date")
  })

  it("splits data-bound and custom fields into tabs, and won't add a binding twice", async () => {
    const onAddBinding = vi.fn()
    const binding: BindingDescriptor = {
      key: "client.firstName",
      label: "First name",
      access: "readWrite",
      version: 1,
      description: "",
      anchor: "client",
      control: { kind: "text" },
      overridable: ["label"],
    }
    render(
      <FieldPalette
        bindings={{ status: "ready", bindings: [binding] }}
        onAddBinding={onAddBinding}
        usedBindingKeys={new Set(["client.firstName"])}
      />,
    )

    expect(
      screen.getByRole("button", { name: "First name (already added)" }),
    ).toBeDisabled()
    expect(screen.queryByText("Text")).toBeNull()

    await userEvent.click(screen.getByRole("tab", { name: "Custom" }))

    expect(screen.getByText("Text")).toBeInTheDocument()
    expect(screen.queryByText("First name")).toBeNull()
  })
})
