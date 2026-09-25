import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { BindingDescriptor, BoundField } from "shared"
import { FieldInspector } from "./FieldInspector.js"
import { toJsonSchema } from "./schema/toJsonSchema.js"

const title: BindingDescriptor = {
  key: "client.title",
  version: 1,
  label: "Title",
  description: "",
  anchor: "client",
  access: "readWrite",
  control: { kind: "lookup" },
  overridable: ["label", "required"],
  presentations: { allowed: ["dropdown", "radio"], default: "dropdown" },
  options: { href: "/bindings/client.title/options", allowBlank: true },
  validation: { required: false, rules: [{ type: "oneOfOptions" }] },
  operations: {
    resolve: { href: "/resolve" },
    commit: { href: "/commit", strategy: "lookup" },
  },
}

const field = (overrides: Partial<BoundField> = {}): BoundField => ({
  id: "f1",
  type: "bound",
  label: "Title",
  required: false,
  binding: title,
  ...overrides,
})

function inspect(f: BoundField, onChange = vi.fn()) {
  render(
    <FieldInspector
      field={f}
      onChange={onChange}
      onDelete={vi.fn()}
      isPublished={() => false}
    />,
  )
  return onChange
}

describe("a data-bound lookup field", () => {
  it("lets the form admin choose among the presentations the binding allows", async () => {
    const onChange = inspect(field())
    const showAs = screen.getByRole("combobox", { name: "Show as" })
    expect(showAs).toHaveValue("dropdown")
    await userEvent.selectOptions(showAs, "radio")
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ presentation: "radio" }))
  })

  it("offers no choice when the binding allows only one presentation", () => {
    inspect(
      field({
        binding: { ...title, presentations: { allowed: ["dropdown"], default: "dropdown" } },
      }),
    )
    expect(screen.queryByRole("combobox", { name: "Show as" })).toBeNull()
  })

  it("forces Required on when the store itself requires a value", () => {
    inspect(field({ binding: { ...title, validation: { required: true, rules: [] } } }))
    const required = screen.getByRole("checkbox", { name: /Required/ })
    expect(required).toBeChecked()
    expect(required).toBeDisabled()
  })

  it("renders as radio buttons only when the form chose that", () => {
    const element = (f: BoundField) =>
      toJsonSchema({ fields: [f] }).uiSchema.elements[0] as { options?: { format?: string } }
    expect(element(field()).options?.format).toBeUndefined()
    expect(element(field({ presentation: "radio" })).options?.format).toBe("radio")
  })
})
