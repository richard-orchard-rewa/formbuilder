import { test, expect } from "@playwright/test"
import { dragFieldTypeOntoCanvas } from "../helpers/dnd.js"

// Walks a form through its full lifecycle end-to-end: build a draft, publish
// it, have a respondent submit it, then have an admin correct that
// submission — the core loop the whole app exists to support.
test("create, build, publish, submit, and edit a form", async ({
  page,
  request,
}) => {
  const formName = `E2E form ${Date.now()}`

  await page.goto("/")

  page.once("dialog", (dialog) => dialog.accept(formName))
  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith("/api/forms") && res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "New form" }).click(),
  ])
  const form = (await createResponse.json()) as { id: string; name: string }

  const formRow = page.locator(".form-list__item", { hasText: formName })
  await expect(formRow).toBeVisible()

  // Build: add a required text field and a plain text area.
  await formRow.getByRole("button", { name: "Build" }).click()
  await expect(page.getByRole("heading", { name: formName })).toBeVisible()

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

  // Publish: no UI affordance exists yet for this (US-2.5 only wired a
  // preview), so drive the endpoint directly with an authenticated request
  // against the same origin the page is running on.
  const publishResponse = await request.post(`/api/forms/${form.id}/publish`)
  expect(publishResponse.ok()).toBe(true)

  await page.getByRole("button", { name: "← Back" }).click()

  // Submit: fill out the published form as a respondent.
  await formRow.getByRole("button", { name: "Fill out" }).click()
  await page.getByLabel(/Full name/).fill("Ada Lovelace")
  await page.getByLabel(/Notes/).fill("Looking forward to this.")
  await page.getByRole("button", { name: "Submit" }).click()
  await expect(
    page.getByText("Thanks — your response was recorded."),
  ).toBeVisible()

  // Edit: an admin corrects the submission just recorded.
  await page.getByRole("button", { name: "← Back" }).click()
  await formRow.getByRole("button", { name: "Submissions" }).click()

  const submissionRow = page.locator(".form-list__item", {
    hasText: "Submitted",
  })
  await expect(submissionRow).toBeVisible()
  await submissionRow.getByRole("button", { name: "Edit" }).click()

  await expect(page.getByLabel(/Full name/)).toHaveValue("Ada Lovelace")
  await page.getByLabel(/Full name/).fill("Ada, Countess of Lovelace")
  await page.getByRole("button", { name: "Save changes" }).click()

  await expect(page.getByText("Saved.")).toBeVisible()
  await expect(page.getByText(/No edits yet\./)).not.toBeVisible()
})
