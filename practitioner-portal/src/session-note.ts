import type {
  AnchorContext,
  BindingCommitResult,
  BindingDescriptor,
  BoundValues,
  CaseContext,
  SessionAnchor,
  SessionParticipant,
} from "shared"
import { moduleById } from "./seed/modules"
import type { BoundFieldDef, ModuleDef, SessionTemplate } from "./seed/types"

// One module as it appears on a session note: a client module appears once
// per participant, anchored on that participant's client record.
export interface ModuleInstance {
  key: string
  module: ModuleDef
  // Which resolve/commit group its bound fields belong to.
  group: string
  participant?: SessionParticipant
}

// The bound fields read and written together: everything on one anchor --
// the case, the session, one participant's client record, or one
// participant's attendance. The DBS takes exactly one anchor per resolve
// and commit, so each group is one call and, on submit, at most one write
// to one ICIS record.
export interface BindingGroup {
  id: string
  label: string
  anchor: AnchorContext
  bindings: string[]
}

// Stable across reloads (client numbers, not anchor IDs), so a saved note's
// commit results line up with the groups when it's reopened.
const groupFor = (module: ModuleDef, participant?: SessionParticipant) =>
  participant ? `${module.scope}:${participant.client.clientNumber ?? participant.client.id}` : module.scope

export function instancesFor(template: SessionTemplate, session: SessionAnchor): ModuleInstance[] {
  return template.modules.flatMap((id): ModuleInstance[] => {
    const module = moduleById(id)
    if (module.scope === "case" || module.scope === "session") {
      return [{ key: module.id, module, group: groupFor(module) }]
    }
    return session.participants.map((p) => ({
      key: `${module.id}:${p.client.clientNumber}`,
      module,
      group: groupFor(module, p),
      participant: p,
    }))
  })
}

export const boundFields = (module: ModuleDef) =>
  module.fields.filter((f): f is BoundFieldDef => f.kind === "bound")

function anchorFor(instance: ModuleInstance, session: SessionAnchor, caseContext: CaseContext): AnchorContext {
  switch (instance.module.scope) {
    case "case":
      return { case: caseContext.id }
    case "session":
      return { session: session.id }
    case "client":
      return { client: instance.participant!.client.id }
    case "participant":
      return { participant: instance.participant!.id }
  }
}

function labelFor(instance: ModuleInstance) {
  const who = instance.participant?.client.displayName
  switch (instance.module.scope) {
    case "case":
      return "Case"
    case "session":
      return "Session"
    case "client":
      return `${who} · client record`
    case "participant":
      return `${who} · attendance`
  }
}

// Every published binding the note's modules use, grouped by the anchor it
// reads and writes. The modules on one anchor (Client details and ... for
// the same person) share a group.
export function bindingGroups(
  instances: ModuleInstance[],
  session: SessionAnchor,
  caseContext: CaseContext,
  dictionary: Map<string, BindingDescriptor>,
): BindingGroup[] {
  const groups = new Map<string, BindingGroup>()
  for (const instance of instances) {
    const keys = boundFields(instance.module)
      .map((f) => f.binding)
      .filter((key) => dictionary.has(key))
    if (keys.length === 0) continue
    const group = groups.get(instance.group) ?? {
      id: instance.group,
      label: labelFor(instance),
      anchor: anchorFor(instance, session, caseContext),
      bindings: [],
    }
    group.bindings = [...new Set([...group.bindings, ...keys])]
    groups.set(instance.group, group)
  }
  return [...groups.values()]
}

// What a submit sends for one group: only the writable values the
// practitioner changed, with what they were when the note was opened.
export function changesFor(
  group: BindingGroup,
  dictionary: Map<string, BindingDescriptor>,
  current: BoundValues,
  baseline: BoundValues,
): BoundValues {
  const changed: BoundValues = {}
  for (const key of group.bindings) {
    if (dictionary.get(key)?.access !== "readWrite") continue
    if (norm(current[key]) !== norm(baseline[key])) changed[key] = norm(current[key])
  }
  return changed
}

const norm = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim()
  return trimmed === "" ? null : trimmed
}

// Sessions carry no status: one that has started is past (or under way).
export const hasStarted = (session: SessionAnchor) =>
  session.start !== null && new Date(session.start).getTime() <= Date.now()

// A commit result as the practitioner reads it.
export function outcomeText(result: BindingCommitResult, currentLabel?: string): string {
  switch (result.status) {
    case "written":
      return "Saved to ICIS"
    case "unchanged":
      return "Unchanged"
    case "readOnly":
      return "Display only"
    case "conflict":
      return `Not saved — changed in ICIS since the note was opened (ICIS now has "${currentLabel ?? result.current ?? "no value"}")`
    case "failed":
      return `Not saved — ${result.message ?? "refused"}`
    case "skipped":
      return "Not sent"
  }
}
