import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Submission, SubmissionDetail } from "shared"
import * as api from "./api.js"
import { SubmissionEdit } from "./SubmissionEdit.js"

const detail: SubmissionDetail = {
  id: "sub-1",
  formId: "form-1",
  formVersionId: "v1",
  status: "submitted",
  data: { name: "Ada" },
  legacyData: null,
  migratedFromSubmissionId: null,
  submittedBy: null,
  submittedAt: "2026-09-01T00:00:00.000Z",
  formVersionNumber: 1,
  schema: {
    fields: [{ id: "name", type: "text", label: "Name", required: false }],
  },
}

describe("SubmissionEdit", () => {
  it("keeps the save confirmation through the post-save reload, and clears it on a real edit", async () => {
    const user = userEvent.setup()
    vi.spyOn(api, "getSubmission").mockResolvedValue(detail)
    vi.spyOn(api, "getSubmissionHistory").mockResolvedValue([])
    const edit = vi
      .spyOn(api, "editSubmission")
      .mockResolvedValue(detail as Submission)

    render(
      <SubmissionEdit
        formId="form-1"
        formName="Intake"
        submissionId="sub-1"
        onBack={() => {}}
      />,
    )

    await user.click(await screen.findByRole("button", { name: "Save changes" }))

    expect(edit).toHaveBeenCalledWith("form-1", "sub-1", { name: "Ada" })
    // The reload re-mounts <JsonForms>, whose initial onChange used to wipe
    // the message -- wait for that reload to settle before checking.
    await waitFor(() => expect(api.getSubmission).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole("textbox")).toHaveValue("Ada")
    expect(screen.getByText("Saved.")).toBeInTheDocument()

    await user.type(screen.getByRole("textbox"), "!")

    // Vanilla text inputs debounce their change before onChange fires.
    await waitFor(() =>
      expect(screen.queryByText("Saved.")).not.toBeInTheDocument(),
    )
  })
})
