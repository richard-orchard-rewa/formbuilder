import { test, expect } from "@playwright/test"
import { dragFieldTypeOntoCanvas } from "../helpers/dnd.js"

// Walks a module through its Epic US-7 lifecycle: create it, build a couple
// of fields, and publish it. There's no fill-out step for a module in this
// epic -- that's a session template's job (Epic US-8) -- so this stops
// where form-lifecycle.spec.ts's build phase does.
test("create, build, and publish a module", async ({ page, request }) => {
  const moduleName = `E2E module ${Date.now()}`

  await page.goto("/")
  await page.getByRole("button", { name: "Modules" }).click()
  await expect(page.getByRole("heading", { name: "Modules" })).toBeVisible()

  // "New module" prompts twice: name, then an optional description.
  let dialogCount = 0
  page.on("dialog", (dialog) => {
    dialogCount += 1
    if (dialogCount === 1) {
      dialog.accept(moduleName)
    } else {
      dialog.dismiss()
    }
  })
  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/modules") && res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "New module" }).click(),
  ])
  const mod = (await createResponse.json()) as { id: string; name: string }

  const moduleRow = page.locator(".form-list__item", { hasText: moduleName })
  await expect(moduleRow).toBeVisible()

  // Build: add a required text field and a plain text area.
  await moduleRow.getByRole("button", { name: "Build" }).click()
  await expect(page.getByRole("heading", { name: moduleName })).toBeVisible()

  await dragFieldTypeOntoCanvas(page, "Text")
  await page.getByLabel("Label").fill("Full name")
  await page.getByLabel("Required").check()

  await dragFieldTypeOntoCanvas(page, "Text area")
  await page.getByLabel("Label").fill("Notes")

  await expect(
    page.locator(".form-canvas__field", { hasText: "Full name" }),
  ).toBeVisible()
  await expect(
    page.locator(".form-canvas__field", { hasText: "Notes" }),
  ).toBeVisible()

  // Preview: toggling to preview renders the same fields read-only (US-7.5).
  await page.getByRole("button", { name: "Preview" }).click()
  await expect(page.getByLabel(/Full name/)).toBeVisible()
  await page.getByRole("button", { name: "Back to editing" }).click()

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

  // Archive (US-7.4): the module drops out of the (non-archived) list.
  await page.getByRole("button", { name: "← Back" }).click()
  await moduleRow.getByRole("button", { name: "Archive" }).click()
  await expect(moduleRow).not.toBeVisible()
})
