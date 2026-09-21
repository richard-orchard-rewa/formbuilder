import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ModuleSummary } from "shared"
import * as api from "./api.js"
import { ModulesList } from "./ModulesList.js"

const modules: ModuleSummary[] = [
  {
    id: "1",
    name: "Attendance",
    description: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Counselling notes",
    description: null,
    archivedAt: null,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
]

describe("ModulesList", () => {
  it("lists non-archived modules and lets an admin open one to build (US-7.4)", async () => {
    vi.spyOn(api, "listModules").mockResolvedValue(modules)
    render(<ModulesList onBack={() => {}} onBuild={() => {}} />)

    expect(await screen.findByText("Attendance")).toBeInTheDocument()
    expect(screen.getByText("Counselling notes")).toBeInTheDocument()
  })

  it("shows a no-matches state when the search has no results", async () => {
    vi.spyOn(api, "listModules").mockResolvedValue([])
    render(<ModulesList onBack={() => {}} onBuild={() => {}} />)

    expect(await screen.findByText("No matches.")).toBeInTheDocument()
  })

  it("re-queries with the search term as it changes", async () => {
    const spy = vi.spyOn(api, "listModules").mockResolvedValue(modules)
    render(<ModulesList onBack={() => {}} onBuild={() => {}} />)
    await waitFor(() => expect(spy).toHaveBeenCalledWith(""))

    await userEvent.type(screen.getByLabelText("Search"), "Att")

    await waitFor(() => expect(spy).toHaveBeenLastCalledWith("Att"))
  })
})
