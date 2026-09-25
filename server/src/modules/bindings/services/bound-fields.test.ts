import type { BindingDescriptor, CommitRequest, Field } from "shared"
import { describe, expect, it } from "vitest"
import { BindingServiceError, type BindingClient } from "../binding-client.js"
import type {
  SubmissionBindingRecord,
  SubmissionBindingsRepository,
} from "../repositories/submission-bindings.js"
import { BoundFieldsService } from "./bound-fields.js"

const CLIENT = "2c616f0e-d741-f011-8779-000d3ad0ea14"

function descriptor(
  key: string,
  access: BindingDescriptor["access"],
): BindingDescriptor {
  return {
    key,
    version: 1,
    label: key,
    description: "",
    anchor: "client",
    access,
    control: { kind: "text" },
    overridable: ["label"],
  }
}

const fields: Field[] = [
  { id: "notes", type: "textarea", label: "Notes", required: false },
  {
    id: "f1",
    type: "bound",
    label: "First name",
    required: true,
    binding: descriptor("client.firstName", "readWrite"),
  },
  {
    id: "f2",
    type: "bound",
    label: "Last name",
    required: false,
    binding: descriptor("client.lastName", "readWrite"),
  },
  {
    id: "f3",
    type: "bound",
    label: "Client number",
    required: false,
    binding: descriptor("client.clientNumber", "read"),
  },
]

class RecordingRepo implements SubmissionBindingsRepository {
  records: SubmissionBindingRecord[] = []
  async record(entry: SubmissionBindingRecord) {
    this.records.push(entry)
  }
}

function fakeClient(commit: BindingClient["commit"]): BindingClient {
  const unused = () => Promise.reject(new Error("not used"))
  return {
    listBindings: unused,
    getOptions: unused,
    findClient: unused,
    resolve: unused,
    commit,
  }
}

describe("BoundFieldsService.commit", () => {
  it("sends only writable bound values, blanks as null, and records the outcome", async () => {
    const sent: CommitRequest[] = []
    const repo = new RecordingRepo()
    const service = new BoundFieldsService(
      fakeClient(async (request) => {
        sent.push(request)
        return {
          results: {
            "client.firstName": { status: "written" },
            "client.lastName": { status: "unchanged" },
          },
        }
      }),
      repo,
    )
    const baseline = { "client.firstName": "Bob" }

    const results = await service.commit(
      "sub-1",
      fields,
      { notes: "hi", f1: "Bobby", f3: "00152076" },
      { anchor: { client: CLIENT }, baseline },
    )

    expect(sent).toEqual([
      {
        anchor: { client: CLIENT },
        values: { "client.firstName": "Bobby", "client.lastName": null },
        baseline,
      },
    ])
    expect(results?.["client.firstName"]).toEqual({ status: "written" })
    expect(repo.records[0]).toMatchObject({ submissionId: "sub-1", results })
  })

  it("does nothing for a form with no writable bound fields", async () => {
    const repo = new RecordingRepo()
    const service = new BoundFieldsService(
      fakeClient(() => Promise.reject(new Error("should not be called"))),
      repo,
    )
    expect(await service.commit("sub-1", fields.slice(0, 1), {}, undefined)).toBeUndefined()
    expect(repo.records).toHaveLength(0)
  })

  it("marks every value skipped when no client was selected", async () => {
    const service = new BoundFieldsService(
      fakeClient(() => Promise.reject(new Error("should not be called"))),
      new RecordingRepo(),
    )
    const results = await service.commit("sub-1", fields, { f1: "Bob" }, undefined)
    expect(results?.["client.firstName"].status).toBe("skipped")
  })

  it("reports an unreachable Data Binding Service per field instead of failing the submission", async () => {
    const repo = new RecordingRepo()
    const service = new BoundFieldsService(
      fakeClient(() =>
        Promise.reject(new BindingServiceError(502, "The Data Binding Service is unavailable")),
      ),
      repo,
    )
    const results = await service.commit("sub-1", fields, { f1: "Bob" }, {
      anchor: { client: CLIENT },
    })
    expect(results).toEqual({
      "client.firstName": { status: "failed", message: "The Data Binding Service is unavailable" },
      "client.lastName": { status: "failed", message: "The Data Binding Service is unavailable" },
    })
    expect(repo.records).toHaveLength(1)
  })
})
