import {
  isBoundField,
  type AnchorContext,
  type BindingCommitResult,
  type BoundValues,
  type Field,
  type SessionTemplateBindingContext,
  type SessionTemplateBindingResults,
  type SessionTemplateSection,
} from "shared"
import {
  BindingServiceError,
  type BindingClient,
} from "../../bindings/binding-client.js"
import type { SessionTemplateSubmissionBindingsRepository } from "../repositories/session-template-submission-bindings.js"

type Results = Record<string, BindingCommitResult>

// The participant-scoped values captured for one participant.
export function participantData(
  data: Record<string, unknown>,
  participant: string,
): Record<string, unknown> {
  const all = data.participants
  if (!all || typeof all !== "object") return {}
  const own = (all as Record<string, unknown>)[participant]
  return own && typeof own === "object" ? (own as Record<string, unknown>) : {}
}

function writableValues(fields: Field[], data: Record<string, unknown>, anchor: string) {
  const values: BoundValues = {}
  for (const field of fields.filter(isBoundField)) {
    if (field.binding.access !== "readWrite" || field.binding.anchor !== anchor) continue
    const value = data[field.id]
    values[field.binding.key] = typeof value === "string" ? value : null
  }
  return values
}

// Sends a session note's data-bound values on to the Data Binding Service:
// one commit per anchor -- the session, then for each participant their
// attendance record and their client -- so each person's values land on
// that person's records only. As with forms (bindings/services/
// bound-fields.ts) the note is already saved; a refused or unreachable
// write is reported per field, and one participant's failure never stops
// another's write.
export class SessionBoundFieldsService {
  constructor(
    private readonly client: BindingClient,
    private readonly repo: SessionTemplateSubmissionBindingsRepository,
  ) {}

  async commit(
    submissionId: string,
    sections: SessionTemplateSection[],
    data: Record<string, unknown>,
    context: SessionTemplateBindingContext | undefined,
  ): Promise<SessionTemplateBindingResults | undefined> {
    const sessionFields = sections.filter((s) => s.scope === "session").flatMap((s) => s.fields)
    const participantFields = sections
      .filter((s) => s.scope === "participant")
      .flatMap((s) => s.fields)

    const out: SessionTemplateBindingResults = {}
    const sessionValues = writableValues(sessionFields, data, "session")
    if (Object.keys(sessionValues).length > 0) {
      out.session = await this.send(
        submissionId,
        null,
        context ? { session: context.session } : null,
        sessionValues,
        context?.baseline?.session,
      )
    }

    for (const p of context?.participants ?? []) {
      const own = participantData(data, p.participant)
      const baseline = context?.baseline?.participants?.[p.participant]
      const results: Results = {}
      const attendance = writableValues(participantFields, own, "participant")
      if (Object.keys(attendance).length > 0) {
        Object.assign(
          results,
          await this.send(
            submissionId,
            p.participant,
            { participant: p.participant },
            attendance,
            baseline?.participant,
          ),
        )
      }
      const client = writableValues(participantFields, own, "client")
      if (Object.keys(client).length > 0) {
        Object.assign(
          results,
          await this.send(submissionId, p.participant, { client: p.client }, client, baseline?.client),
        )
      }
      if (Object.keys(results).length > 0) {
        out.participants = { ...out.participants, [p.participant]: results }
      }
    }

    return out.session || out.participants ? out : undefined
  }

  // What came back from a submission's commits, grouped as on submit.
  async resultsFor(submissionId: string): Promise<SessionTemplateBindingResults | undefined> {
    const records = await this.repo.list(submissionId)
    if (records.length === 0) return undefined
    const out: SessionTemplateBindingResults = {}
    for (const record of records) {
      if (record.participant === null) {
        out.session = { ...out.session, ...record.results }
      } else {
        out.participants = {
          ...out.participants,
          [record.participant]: {
            ...out.participants?.[record.participant],
            ...record.results,
          },
        }
      }
    }
    return out
  }

  private async send(
    submissionId: string,
    participant: string | null,
    anchor: AnchorContext | null,
    values: BoundValues,
    baseline: BoundValues | undefined,
  ): Promise<Results> {
    let results: Results
    if (!anchor) {
      results = allWith(values, {
        status: "skipped",
        message: "No session was selected, so nothing was sent",
      })
    } else {
      try {
        results = (await this.client.commit({ anchor, values, baseline })).results
      } catch (error) {
        if (!(error instanceof BindingServiceError)) throw error
        results = allWith(values, { status: "failed", message: error.message })
      }
    }
    await this.repo.record({
      submissionId,
      participant,
      anchor,
      baseline: baseline ?? null,
      values,
      results,
    })
    return results
  }
}

function allWith(values: BoundValues, result: BindingCommitResult): Results {
  return Object.fromEntries(Object.keys(values).map((key) => [key, result]))
}
