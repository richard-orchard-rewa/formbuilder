import type { Page } from "@playwright/test"

// Opens one of the admin shell's sidebar sections. Scoped to the sidebar
// nav, since the home page's library links carry similar names.
export async function openNav(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Form administration" })
    .getByRole("button", { name, exact: true })
    .click()
}

// Creates a module through the builder's setup step and lands on its
// fields step. Returns the created module.
export async function createModule(page: Page, name: string) {
  await openNav(page, "Modules")
  await page.getByRole("button", { name: "Create module" }).click()
  await page.getByLabel("Module name").fill(name)
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith("/api/modules") && res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Next" }).click(),
  ])
  await page.getByRole("heading", { name, level: 1 }).waitFor()
  return (await response.json()) as { id: string; name: string }
}

// Creates a session template through its setup step and lands in the
// template builder. Returns the created template.
export async function createSessionTemplate(page: Page, name: string) {
  await openNav(page, "Session templates")
  await page.getByRole("button", { name: "Create template" }).click()
  await page.getByLabel("Template name").fill(name)
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/session-templates") &&
        res.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Next" }).click(),
  ])
  await page.getByRole("heading", { name, level: 1 }).waitFor()
  return (await response.json()) as { id: string; name: string }
}
