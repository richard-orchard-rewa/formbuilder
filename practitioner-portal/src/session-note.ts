import type {
  AnchorContext,
  BindingCommitResult,
  BindingDescriptor,
  BoundValues,
  ClientAnchor,
  SessionContext,
} from "shared"
import { moduleById } from "./seed/modules"
import type { BoundFieldDef, ModuleDef, SessionTemplate } from "./seed/types"

// One module as it appears on a session note: a client module appears once
// per client, anchored on that client.
export interface ModuleInstance {
  key: string
  module: ModuleDef
  // Which resolve/commit group its bound fields belong to.
  group: string
  anchor: AnchorContext
  client?: ClientAnchor
}

// The bound fields sharing one resolve and one commit: the case and the
// session together, and each person's client record together with their
// attendance.
export interface BindingGroup {
  id: string
  label: string
  anchor: AnchorContext
  bindings: string[]
}

export const SHARED_GROUP = "shared"
const personGroup = (client: ClientAnchor) => `person:${client.clientNumber ?? client.id}`

export function instancesFor(template: SessionTemplate, session: SessionContext): ModuleInstance[] {
  return template.modules.flatMap((id): ModuleInstance[] => {
    const module = moduleById(id)
    switch (module.scope) {
      case "case":
        return session.case
          ? [{ key: module.id, module, group: SHARED_GROUP, anchor: { case: session.case.id } }]
          : []
      case "session":
        return [{ key: module.id, module, group: SHARED_GROUP, anchor: { session: session.id } }]
      case "client":
        return session.participants.map((p) => ({
          key: `${module.id}:${p.client.clientNumber}`,
          module,
          group: personGroup(p.client),
          anchor: { client: p.client.id },
          client: p.client,
        }))
      case "sessionParticipant":
        return session.participants.map((p) => ({
          key: `${module.id}:${p.client.clientNumber}`,
          module,
          group: personGroup(p.client),
          anchor: { sessionParticipant: p.id },
          client: p.client,
        }))
    }
  })
}

export const boundFields = (module: ModuleDef) =>
  module.fields.filter((f): f is BoundFieldDef => f.kind === "bound")

// Groups every published binding the note's modules use by anchor, so the
// note opens with one resolve per group rather than one per module.
export function bindingGroups(
  instances: ModuleInstance[],
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
      label: instance.client ? instance.client.displayName : "Case and session",
      anchor: {},
      bindings: [],
    }
    group.anchor = { ...group.anchor, ...instance.anchor }
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
