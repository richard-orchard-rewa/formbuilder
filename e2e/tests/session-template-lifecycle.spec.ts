import { test, expect } from "@playwright/test"
import { createModule, createSessionTemplate } from "../helpers/admin.js"
import { dragFieldTypeOntoCanvas } from "../helpers/dnd.js"

// Walks a session template through its Epic US-8 lifecycle: build and
// publish a module to compose it from (Epic US-7's own lifecycle), create
// the template, add the module, preview the "live reference" behaviour,
// publish, fill it out, and check its version history -- the full loop
// the Modules & Session Templates proposal exists to demonstrate.
test("compose, publish, fill out, and review a session template", async ({
  page,
  request,
}) => {
  const moduleName = `E2E module for template ${Date.now()}`
  const templateName = `E2E session template ${Date.now()}`

  // Build and publish a module to compose the template from.
  await page.goto("/")
  const mod = await createModule(page, moduleName)
  await dragFieldTypeOntoCanvas(page, "Text")
  await page.getByLabel("Label").fill("Full name")
  await page.getByLabel("Required").check()

  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/modules/${mod.id}/publish`) &&
        res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Publish" }).click(),
  ])

  // Create the session template and compose it from that module.
  const template = await createSessionTemplate(page, templateName)

  await page.getByLabel("Search").fill(moduleName)
  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/session-templates/${template.id}/modules`) &&
        res.request().method() === "PUT",
    ),
    page.getByRole("button", { name: `Add ${moduleName}` }).click(),
  ])
  await expect(
    page.locator(".template-module-card", { hasText: moduleName }),
  ).toBeVisible()

  // Preview proves the composition resolves the module's fields (US-8.3).
  await page.getByRole("button", { name: "Preview" }).click()
  await expect(page.getByRole("dialog").getByLabel(/Full name/)).toBeVisible()
  await page.getByRole("button", { name: "Close preview" }).click()

  // Publish (US-8.4).
  const [publishResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/session-templates/${template.id}/publish`) &&
        res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Publish" }).click(),
  ])
  expect(publishResponse.ok()).toBe(true)

  // Fill it out (US-8.5).
  await page.getByRole("button", { name: "Back to session templates" }).click()
  const templateRow = page.locator(".form-list__item", {
    hasText: templateName,
  })
  await templateRow.getByRole("button", { name: "Fill out" }).click()
  await page.getByLabel(/Full name/).fill("Ada Lovelace")
  await page.getByRole("button", { name: "Submit" }).click()
  await expect(
    page.getByText("Thanks — your response was recorded."),
  ).toBeVisible()

  // Reviewing submissions: the one just captured shows up, against v1,
  // and opening it renders the answer read-only.
  await page.getByRole("button", { name: "← Back" }).click()
  await templateRow.getByRole("button", { name: "Submissions" }).click()
  await expect(
    page.getByRole("heading", { name: `${templateName} — Submissions` }),
  ).toBeVisible()
  const submissionRow = page.locator(".form-list__item", { hasText: "v1" })
  await expect(submissionRow).toBeVisible()
  await submissionRow.getByRole("button", { name: "View" }).click()
  await expect(page.getByText(/Captured against version 1/)).toBeVisible()
  await expect(page.getByLabel(/Full name/)).toHaveValue("Ada Lovelace")
  await expect(page.getByLabel(/Full name/)).toBeDisabled()

  // Version history shows the published version (US-8.7, US-8.8).
  await page.getByRole("button", { name: "← Back" }).click() // submission list
  await page.getByRole("button", { name: "← Back" }).click() // session templates list
  await templateRow.getByRole("button", { name: "Edit" }).click()
  await page.getByRole("button", { name: "Version history" }).click()
  await expect(page.getByText(/v1 — active/)).toBeVisible()
  await page.getByRole("button", { name: "View" }).click()
  await expect(page.getByText(new RegExp(`${moduleName} — v1`))).toBeVisible()

  // Archive drops it from the (non-archived) list (US-8.6).
  await request.post(`/api/session-templates/${template.id}/archive`)
})
