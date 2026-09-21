import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { SessionTemplateSummary } from "shared"
import * as api from "./api.js"
import { SessionTemplatesList } from "./SessionTemplatesList.js"

const sessionTemplates: SessionTemplateSummary[] = [
  {
    id: "1",
    name: "Intake session",
    description: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Counselling session",
    description: null,
    archivedAt: null,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
]

describe("SessionTemplatesList", () => {
  it("lists non-archived session templates and lets an admin open one (US-8.6)", async () => {
    vi.spyOn(api, "listSessionTemplates").mockResolvedValue(sessionTemplates)
    render(
      <SessionTemplatesList
        onBack={() => {}}
        onBuild={() => {}}
        onFill={() => {}}
        onSubmissions={() => {}}
      />,
    )

    expect(await screen.findByText("Intake session")).toBeInTheDocument()
    expect(screen.getByText("Counselling session")).toBeInTheDocument()
  })

  it("shows a no-matches state when the search has no results", async () => {
    vi.spyOn(api, "listSessionTemplates").mockResolvedValue([])
    render(
      <SessionTemplatesList
        onBack={() => {}}
        onBuild={() => {}}
        onFill={() => {}}
        onSubmissions={() => {}}
      />,
    )

    expect(await screen.findByText("No matches.")).toBeInTheDocument()
  })

  it("re-queries with the search term as it changes", async () => {
    const spy = vi
      .spyOn(api, "listSessionTemplates")
      .mockResolvedValue(sessionTemplates)
    render(
      <SessionTemplatesList
        onBack={() => {}}
        onBuild={() => {}}
        onFill={() => {}}
        onSubmissions={() => {}}
      />,
    )
    await waitFor(() => expect(spy).toHaveBeenCalledWith(""))

    await userEvent.type(screen.getByLabelText("Search"), "Intake")

    await waitFor(() => expect(spy).toHaveBeenLastCalledWith("Intake"))
  })
})
