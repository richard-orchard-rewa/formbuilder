import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Field } from "shared"
import { FieldInspector } from "./FieldInspector.js"

const textField: Field = {
  id: "field-1",
  type: "text",
  label: "Name",
  required: false,
}

describe("FieldInspector", () => {
  it("prompts to select a field when nothing is selected", () => {
    render(
      <FieldInspector
        field={null}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        isPublished={() => false}
      />,
    )
    expect(
      screen.getByText("Select a field on the canvas to configure it."),
    ).toBeInTheDocument()
  })

  it("toggles required on and reports the change", async () => {
    const onChange = vi.fn()
    render(
      <FieldInspector
        field={textField}
        onChange={onChange}
        onDelete={vi.fn()}
        isPublished={() => false}
      />,
    )
    await userEvent.click(screen.getByLabelText("Required"))
    expect(onChange).toHaveBeenCalledWith({ ...textField, required: true })
  })

  it("deletes an unpublished field without confirming", async () => {
    const onDelete = vi.fn()
    const confirm = vi.spyOn(window, "confirm")
    render(
      <FieldInspector
        field={textField}
        onChange={vi.fn()}
        onDelete={onDelete}
        isPublished={() => false}
      />,
    )
    await userEvent.click(screen.getByText("Delete field"))
    expect(confirm).not.toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledWith(textField.id)
  })

  it("asks for confirmation before deleting a previously published field, and honours a cancel", async () => {
    const onDelete = vi.fn()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    render(
      <FieldInspector
        field={textField}
        onChange={vi.fn()}
        onDelete={onDelete}
        isPublished={() => true}
      />,
    )
    await userEvent.click(screen.getByText("Delete field"))
    expect(confirm).toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })
})
