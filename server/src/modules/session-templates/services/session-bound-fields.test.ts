import type {
  BindingDescriptor,
  CommitRequest,
  Field,
  SessionTemplateSection,
} from "shared"
import { describe, expect, it } from "vitest"
import { BindingServiceError, type BindingClient } from "../../bindings/binding-client.js"
import type {
  SessionTemplateSubmissionBindingRecord,
  SessionTemplateSubmissionBindingsRepository,
} from "../repositories/session-template-submission-bindings.js"
import { SessionBoundFieldsService } from "./session-bound-fields.js"

const SESSION = "11111111-1111-4111-8111-111111111111"
const AISHA = { participant: "22222222-2222-4222-8222-222222222222", client: "33333333-3333-4333-8333-333333333333" }
const TARIQ = { participant: "44444444-4444-4444-8444-444444444444", client: "55555555-5555-4555-8555-555555555555" }

function bound(id: string, key: string, anchor: BindingDescriptor["anchor"]): Field {
  return {
    id,
    type: "bound",
    label: key,
    required: false,
    binding: {
      key,
      version: 1,
      label: key,
      description: "",
      anchor,
      access: "readWrite",
      control: { kind: "text" },
      overridable: ["label"],
    },
  }
}

const sections: SessionTemplateSection[] = [
  {
    moduleId: "session-details",
    moduleName: "Session details",
    scope: "session",
    fields: [{ id: "summary", type: "textarea", label: "Summary", required: false }],
  },
  {
    moduleId: "per-participant",
    moduleName: "Per participant",
    scope: "participant",
    fields: [
      bound("attendance", "participant.attendance", "participant"),
      bound("preferred", "client.preferredName", "client"),
      { id: "notes", type: "textarea", label: "Notes", required: false },
    ],
  },
]

class RecordingRepo implements SessionTemplateSubmissionBindingsRepository {
  records: SessionTemplateSubmissionBindingRecord[] = []
  async record(entry: SessionTemplateSubmissionBindingRecord) {
    this.records.push(entry)
  }
  async list(submissionId: string) {
    return this.records.filter((r) => r.submissionId === submissionId)
  }
}

function fakeClient(commit: BindingClient["commit"]): BindingClient {
  const unused = () => Promise.reject(new Error("not used"))
  return {
    listBindings: unused,
    getOptions: unused,
    findClient: unused,
    findSessions: unused,
    getParticipant: unused,
    resolve: unused,
    commit,
    listCandidates: unused,
    listManaged: unused,
    saveDraft: unused,
    publish: unused,
  }
}

const data = {
  summary: "Joint session",
  participants: {
    [AISHA.participant]: { attendance: "attended", preferred: "Aisha", notes: "A" },
    [TARIQ.participant]: { attendance: "dna", preferred: "Tariq", notes: "T" },
  },
}

describe("SessionBoundFieldsService.commit", () => {
  it("commits each participant's values to their own records, one commit per anchor", async () => {
    const sent: CommitRequest[] = []
    const repo = new RecordingRepo()
    const service = new SessionBoundFieldsService(
      fakeClient(async (request) => {
        sent.push(request)
        return {
          results: Object.fromEntries(
            Object.keys(request.values).map((k) => [k, { status: "written" as const }]),
          ),
        }
      }),
      repo,
    )

    const results = await service.commit("sub-1", sections, data, {
      session: SESSION,
      participants: [AISHA, TARIQ],
      baseline: {
        participants: { [TARIQ.participant]: { participant: { "participant.attendance": "invited" } } },
      },
    })

    expect(sent).toEqual([
      { anchor: { participant: AISHA.participant }, values: { "participant.attendance": "attended" } },
      { anchor: { client: AISHA.client }, values: { "client.preferredName": "Aisha" } },
      {
        anchor: { participant: TARIQ.participant },
        values: { "participant.attendance": "dna" },
        baseline: { "participant.attendance": "invited" },
      },
      { anchor: { client: TARIQ.client }, values: { "client.preferredName": "Tariq" } },
    ])
    expect(results).toEqual({
      participants: {
        [AISHA.participant]: {
          "participant.attendance": { status: "written" },
          "client.preferredName": { status: "written" },
        },
        [TARIQ.participant]: {
          "participant.attendance": { status: "written" },
          "client.preferredName": { status: "written" },
        },
      },
    })
    // Read back later, each result is still against the right person.
    expect(await service.resultsFor("sub-1")).toEqual(results)
  })

  it("keeps one participant's failure from touching another's write", async () => {
    const service = new SessionBoundFieldsService(
      fakeClient(async (request) => {
        if ("client" in request.anchor && request.anchor.client === TARIQ.client) {
          throw new BindingServiceError(502, "The Data Binding Service is unavailable")
        }
        return {
          results: Object.fromEntries(
            Object.keys(request.values).map((k) => [k, { status: "written" as const }]),
          ),
        }
      }),
      new RecordingRepo(),
    )
    const results = await service.commit("sub-1", sections, data, {
      session: SESSION,
      participants: [AISHA, TARIQ],
    })
    expect(results?.participants?.[AISHA.participant]?.["client.preferredName"]).toEqual({
      status: "written",
    })
    expect(results?.participants?.[TARIQ.participant]).toEqual({
      "participant.attendance": { status: "written" },
      "client.preferredName": {
        status: "failed",
        message: "The Data Binding Service is unavailable",
      },
    })
  })

  it("sends nothing when no session was picked", async () => {
    const service = new SessionBoundFieldsService(
      fakeClient(() => Promise.reject(new Error("should not be called"))),
      new RecordingRepo(),
    )
    expect(await service.commit("sub-1", sections, data, undefined)).toBeUndefined()
  })
})
