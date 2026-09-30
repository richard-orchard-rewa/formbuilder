import { test, expect } from "@playwright/test"
import { createModule } from "../helpers/admin.js"
import { dragFieldTypeOntoCanvas } from "../helpers/dnd.js"

// Walks a module through its Epic US-7 lifecycle: create it, build a couple
// of fields, and publish it. There's no fill-out step for a module in this
// epic -- that's a session template's job (Epic US-8) -- so this stops
// where form-lifecycle.spec.ts's build phase does.
test("create, build, and publish a module", async ({ page, request }) => {
  const moduleName = `E2E module ${Date.now()}`

  await page.goto("/")
  // The setup step names the module, then lands on its fields step.
  const mod = await createModule(page, moduleName)

  // Build: add a required text field and a plain text area.
  await dragFieldTypeOntoCanvas(page, "Text")
  await page.getByLabel("Label").fill("Full name")
  await page.getByLabel("Required").check()

  // Clicking a library item adds it too, at the end of the canvas.
  await page.getByRole("button", { name: "Add Text area field" }).click()
  await page.getByLabel("Label").fill("Notes")

  await expect(
    page.locator(".form-canvas__field", { hasText: "Full name" }),
  ).toBeVisible()
  await expect(
    page.locator(".form-canvas__field", { hasText: "Notes" }),
  ).toBeVisible()

  // Preview: renders the same fields in a dialog (US-7.5).
  await page.getByRole("button", { name: "Preview" }).click()
  await expect(page.getByRole("dialog").getByLabel(/Full name/)).toBeVisible()
  await page.getByRole("button", { name: "Close preview" }).click()

  // Publish (US-7.3): no UI affordance beyond the button itself yet needs
  // asserting on, so drive it through the page and confirm the version.
  const [publishResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/modules/${mod.id}/publish`) &&
        res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Publish" }).click(),
  ])
  expect(publishResponse.ok()).toBe(true)

  const activeResponse = await request.get(`/api/modules/${mod.id}/active`)
  expect(activeResponse.ok()).toBe(true)
  const active = (await activeResponse.json()) as { status: string }
  expect(active.status).toBe("published")

  await page.getByRole("button", { name: "Back to modules" }).click()

  // Search (US-7.4): substring, case-insensitive, with a no-matches state.
  const moduleRow = page.locator(".form-list__item", { hasText: moduleName })
  await expect(moduleRow).toBeVisible()
  await page.getByLabel("Search").fill(moduleName.slice(0, 8).toUpperCase())
  await expect(moduleRow).toBeVisible()
  await page.getByLabel("Search").fill(`no such module ${Date.now()}`)
  await expect(page.getByText("No modules found")).toBeVisible()
  await expect(moduleRow).not.toBeVisible()
  await page.getByLabel("Search").fill("")

  // Archive (US-7.4): confirmed in a dialog, then the module drops out of
  // the (non-archived) list.
  await expect(moduleRow).toBeVisible()
  await moduleRow.getByRole("button", { name: "Archive" }).click()
  await page.getByRole("button", { name: "Archive module" }).click()
  await expect(moduleRow).not.toBeVisible()
})
