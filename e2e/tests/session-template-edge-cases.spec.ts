import { test, expect } from "@playwright/test"
import { dragFieldTypeOntoCanvas } from "../helpers/dnd.js"

// The happy-path lifecycle (compose -> preview -> publish -> fill out) is
// covered by session-template-lifecycle.spec.ts. This file covers the
// states that actually determine correctness: publishing nothing,
// filling out something never published, and a respondent skipping a
// required field -- the same category of case the design brief behind
// this feature calls out as the most valuable thing to test.

async function createSessionTemplate(page: import("@playwright/test").Page) {
  const templateName = `E2E edge case template ${Date.now()}-${Math.random()}`
  await page.goto("/")
  await page.getByRole("button", { name: "Session templates" }).click()

  let dialogCount = 0
  page.on("dialog", (dialog) => {
    dialogCount += 1
    if (dialogCount === 1) dialog.accept(templateName)
    else dialog.dismiss()
  })
  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/session-templates") &&
        res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "New session template" }).click(),
  ])
  page.removeAllListeners("dialog")
  const template = (await createResponse.json()) as { id: string; name: string }
  return { templateName, template }
}

test("refuses to publish a session template with no modules", async ({ page }) => {
  const { templateName, template } = await createSessionTemplate(page)
  const templateRow = page.locator(".form-list__item", { hasText: templateName })
  await templateRow.getByRole("button", { name: "Build" }).click()

  const [publishResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/session-templates/${template.id}/publish`) &&
        res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Publish" }).click(),
  ])
  expect(publishResponse.status()).toBe(409)
  await expect(
    page.getByText("This session template has no modules to publish"),
  ).toBeVisible()
})

test("tells a respondent a session template hasn't been published yet", async ({
  page,
}) => {
  const { templateName } = await createSessionTemplate(page)
  const templateRow = page.locator(".form-list__item", { hasText: templateName })
  await templateRow.getByRole("button", { name: "Fill out" }).click()

  await expect(
    page.getByText("This session template hasn't been published yet."),
  ).toBeVisible()
})

test("blocks submission when a required field is left blank", async ({
  page,
  request,
}) => {
  const moduleName = `E2E required-field module ${Date.now()}`

  // Build and publish a module with one required field.
  await page.goto("/")
  await page.getByRole("button", { name: "Modules" }).click()
  let moduleDialogCount = 0
  page.on("dialog", (dialog) => {
    moduleDialogCount += 1
    if (moduleDialogCount === 1) dialog.accept(moduleName)
    else dialog.dismiss()
  })
  const [moduleCreateResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith("/api/modules") && res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "New module" }).click(),
  ])
  page.removeAllListeners("dialog")
  const mod = (await moduleCreateResponse.json()) as { id: string; name: string }

  const moduleRow = page.locator(".form-list__item", { hasText: moduleName })
  await moduleRow.getByRole("button", { name: "Build" }).click()
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
  await page.getByRole("button", { name: "← Back" }).click()

  // Compose and publish a session template from it.
  const { templateName, template } = await createSessionTemplate(page)
  const templateRow = page.locator(".form-list__item", { hasText: templateName })
  await templateRow.getByRole("button", { name: "Build" }).click()
  await page.getByLabel("Search").fill(moduleName)
  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/session-templates/${template.id}/modules`) &&
        res.request().method() === "PUT",
    ),
    page
      .locator(".field-palette__item", { hasText: moduleName })
      .getByRole("button", { name: "Add" })
      .click(),
  ])
  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/session-templates/${template.id}/publish`) &&
        res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Publish" }).click(),
  ])

  // Client-side (JSON Forms/ajv) validation blocks the submit button
  // itself before any request is sent -- leaving the required field blank
  // and clicking Submit must never record a response.
  await page.getByRole("button", { name: "← Back" }).click()
  await templateRow.getByRole("button", { name: "Fill out" }).click()
  await page.getByRole("button", { name: "Submit" }).click()
  await expect(
    page.getByText("Thanks — your response was recorded."),
  ).not.toBeVisible()

  // Server-side validation is the defense behind that client-side check
  // (US-8.5) -- exercise it directly, as if a client bypassed its own
  // validation, the same way SessionTemplateSubmissionsService's own unit
  // tests do, but here against the real route and a live database.
  const activeResponse = await request.get(
    `/api/session-templates/${template.id}/active`,
  )
  const active = (await activeResponse.json()) as {
    schema: { fields: Array<{ id: string; required: boolean }> }
  }
  const requiredFieldId = active.schema.fields.find((f) => f.required)?.id
  expect(requiredFieldId).toBeTruthy()

  const submitResponse = await request.post(
    `/api/session-templates/${template.id}/submissions`,
    { data: { data: {} } },
  )
  expect(submitResponse.status()).toBe(400)
  const body = (await submitResponse.json()) as { missingFieldIds: string[] }
  expect(body.missingFieldIds).toEqual([requiredFieldId])
})

test("session templates library search narrows by name, with a no-matches state", async ({
  page,
}) => {
  const { templateName } = await createSessionTemplate(page)

  // Already on the session templates list right after creation.
  await expect(
    page.locator(".form-list__item", { hasText: templateName }),
  ).toBeVisible()

  await page.getByLabel("Search").fill(templateName)
  await expect(
    page.locator(".form-list__item", { hasText: templateName }),
  ).toBeVisible()

  await page.getByLabel("Search").fill(`no such template ${Date.now()}`)
  await expect(page.getByText("No matches.")).toBeVisible()
  await expect(
    page.locator(".form-list__item", { hasText: templateName }),
  ).not.toBeVisible()
})
