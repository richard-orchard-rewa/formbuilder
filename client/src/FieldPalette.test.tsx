import { render, screen } from "@testing-library/react"
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
})
