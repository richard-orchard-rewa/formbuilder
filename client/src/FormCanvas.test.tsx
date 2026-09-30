import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Field } from "shared"
import { FormCanvas } from "./FormCanvas.js"

const fields: Field[] = [
  { id: "a", type: "text", label: "Full name", required: true },
  { id: "b", type: "textarea", label: "Notes", required: false },
]

function renderCanvas(overrides: Partial<Parameters<typeof FormCanvas>[0]> = {}) {
  const props = {
    fields,
    selectedId: null,
    onDrop: vi.fn(),
    onReorder: vi.fn(),
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(<FormCanvas {...props} />)
  return props
}

describe("FormCanvas", () => {
  it("moves a field by one place with its arrow buttons (US-2.2)", async () => {
    const { onReorder } = renderCanvas()

    await userEvent.click(screen.getByRole("button", { name: "Move Full name down" }))
    // The drop index is a position in the list before the move.
    expect(onReorder).toHaveBeenLastCalledWith("a", 2)

    await userEvent.click(screen.getByRole("button", { name: "Move Notes up" }))
    expect(onReorder).toHaveBeenLastCalledWith("b", 0)

    expect(screen.getByRole("button", { name: "Move Full name up" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move Notes down" })).toBeDisabled()
  })

  it("deletes a field from its card without selecting it", async () => {
    const { onDelete, onSelect } = renderCanvas()

    await userEvent.click(screen.getByRole("button", { name: "Delete Notes" }))

    expect(onDelete).toHaveBeenCalledWith("b")
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("shows an empty state until a field is added", () => {
    renderCanvas({ fields: [] })
    expect(screen.getByText("No fields added")).toBeInTheDocument()
    expect(screen.getByText("0 fields")).toBeInTheDocument()
  })
})
