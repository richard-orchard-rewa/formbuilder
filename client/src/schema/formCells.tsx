import type { CellProps, RankedTester } from "@jsonforms/core"
import { isMultiLineControl, rankWith } from "@jsonforms/core"
import { withJsonFormsCellProps } from "@jsonforms/react"
import { vanillaCells, withVanillaCellProps } from "@jsonforms/vanilla-renderers"

// The vanilla renderer's own multi-line cell has no notion of a visible
// row count at all -- it always renders a plain, unsized <textarea>. This
// overrides it (higher rank) to additionally honor a `rows` UI schema
// option, so a textarea field's configured row count (US-3.2) actually
// renders.
function TextAreaRowsCell(props: CellProps & { className?: string }) {
  const { data, className, id, enabled, uischema, path, handleChange } = props
  const options = uischema.options as
    | { placeholder?: string; rows?: number }
    | undefined
  return (
    <textarea
      value={(data as string) || ""}
      onChange={(event) =>
        handleChange(
          path,
          event.target.value === "" ? undefined : event.target.value,
        )
      }
      className={className}
      id={id}
      disabled={!enabled}
      placeholder={options?.placeholder}
      rows={options?.rows}
    />
  )
}

const textAreaRowsCellTester: RankedTester = rankWith(3, isMultiLineControl)

// The cell registry to use everywhere the app renders a form from
// `toJsonSchema`'s output, in place of `vanillaCells` alone.
export const formCells = [
  {
    tester: textAreaRowsCellTester,
    cell: withJsonFormsCellProps(withVanillaCellProps(TextAreaRowsCell)),
  },
  ...vanillaCells,
]
