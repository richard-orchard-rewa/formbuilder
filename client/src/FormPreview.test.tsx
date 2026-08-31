import { render, screen } from "@testing-library/react"
import type { Field } from "shared"
import { FormPreview } from "./FormPreview.js"

describe("FormPreview", () => {
  it("prompts to add a field when the draft is empty", () => {
    render(<FormPreview fields={[]} />)
    expect(
      screen.getByText("Add a field to the canvas to preview the form."),
    ).toBeInTheDocument()
  })

  it("renders a labelled input for each field in the draft", async () => {
    const fields: Field[] = [
      { id: "name", type: "text", label: "Full name", required: true },
      { id: "notes", type: "textarea", label: "Notes", required: false },
    ]
    render(<FormPreview fields={fields} />)
    expect(screen.getByLabelText(/Full name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Notes/)).toBeInTheDocument()

    // JsonForms debounces its own onChange emission (10ms) even on initial
    // mount; without this it can fire after the test — and jsdom — have
    // already torn down, surfacing as an unrelated "window is not defined"
    // failure in whichever test happens to run next.
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
})
