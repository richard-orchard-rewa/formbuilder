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
    hasPublishedVersion: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Counselling notes",
    description: null,
    archivedAt: null,
    hasPublishedVersion: true,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
]

describe("ModulesList", () => {
  it("lists non-archived modules and lets an admin open one to build (US-7.4)", async () => {
    vi.spyOn(api, "listModules").mockResolvedValue(modules)
    render(<ModulesList onNew={() => {}} onBuild={() => {}} />)

    expect(await screen.findByText("Attendance")).toBeInTheDocument()
    expect(screen.getByText("Counselling notes")).toBeInTheDocument()
  })

  it("shows a no-matches state when the search has no results", async () => {
    vi.spyOn(api, "listModules").mockResolvedValue([])
    render(<ModulesList onNew={() => {}} onBuild={() => {}} />)

    expect(await screen.findByText("No modules found")).toBeInTheDocument()
  })

  it("re-queries with the search term as it changes", async () => {
    const spy = vi.spyOn(api, "listModules").mockResolvedValue(modules)
    render(<ModulesList onNew={() => {}} onBuild={() => {}} />)
    await waitFor(() => expect(spy).toHaveBeenCalledWith(""))

    await userEvent.type(screen.getByLabelText("Search"), "Att")

    await waitFor(() => expect(spy).toHaveBeenLastCalledWith("Att"))
  })

  it("filters to published or not-yet-published modules", async () => {
    vi.spyOn(api, "listModules").mockResolvedValue(modules)
    render(<ModulesList onNew={() => {}} onBuild={() => {}} />)
    await screen.findByText("Attendance")

    await userEvent.selectOptions(
      screen.getByLabelText("Filter by status"),
      "published",
    )

    expect(screen.queryByText("Attendance")).toBeNull()
    expect(screen.getByText("Counselling notes")).toBeInTheDocument()
  })

  it("asks for confirmation before archiving a module (US-7.4)", async () => {
    vi.spyOn(api, "listModules").mockResolvedValue(modules)
    const archive = vi
      .spyOn(api, "archiveModule")
      .mockResolvedValue({ ...modules[0], archivedAt: "2026-02-01T00:00:00.000Z" })
    render(<ModulesList onNew={() => {}} onBuild={() => {}} />)
    await screen.findByText("Attendance")

    const [firstArchive] = screen.getAllByRole("button", { name: "Archive" })
    await userEvent.click(firstArchive)
    expect(archive).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Archive module" }))

    expect(archive).toHaveBeenCalledWith("1")
    await waitFor(() => expect(screen.queryByText("Attendance")).toBeNull())
  })

  it("clones a module into a new copy at the top of the list", async () => {
    vi.spyOn(api, "listModules").mockResolvedValue(modules)
    const copy: ModuleSummary = { ...modules[1], id: "3", name: "Counselling notes Copy" }
    const clone = vi.spyOn(api, "cloneModule").mockResolvedValue(copy)
    render(<ModulesList onNew={() => {}} onBuild={() => {}} />)
    await screen.findByText("Counselling notes")

    await userEvent.click(screen.getAllByRole("button", { name: "Clone" })[1])

    expect(clone).toHaveBeenCalledWith(modules[1])
    expect(
      await screen.findByRole("heading", { name: "Counselling notes Copy" }),
    ).toBeInTheDocument()
  })
})
