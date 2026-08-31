import type { Page } from "@playwright/test"

// The palette → canvas drop is native HTML5 drag-and-drop keyed by a custom
// `dataTransfer` MIME type (see client/src/dnd.ts), which Playwright's
// mouse-based `locator.dragTo()` doesn't reliably trigger. Dispatching the
// drag events directly against a real, shared DataTransfer reproduces what
// the browser does natively without depending on synthetic mouse movement.
export async function dragFieldTypeOntoCanvas(page: Page, fieldLabel: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  const source = page.locator(`.field-palette__item:text-is("${fieldLabel}")`)
  const canvas = page.locator(".form-canvas")

  await source.dispatchEvent("dragstart", { dataTransfer })
  await canvas.dispatchEvent("dragover", { dataTransfer })
  await canvas.dispatchEvent("drop", { dataTransfer })
  await source.dispatchEvent("dragend", { dataTransfer })
}
