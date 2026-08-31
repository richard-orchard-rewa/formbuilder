import { render, screen } from "@testing-library/react"
import { FIELD_TYPE_LABELS, FIELD_TYPES } from "shared"
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
})
