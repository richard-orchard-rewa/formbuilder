import type {
  BindingAnchor,
  BindingCommitResult,
  BindingDescriptor,
  BindingOptions,
  BoundValues,
  ClientAnchor,
  CommitRequest,
  CommitResponse,
  ResolveRequest,
  ResolveResponse,
} from "shared"
import {
  ConcurrentUpdateError,
  StoreWriteError,
  type ClientRecord,
  type ClientStore,
} from "./adapters/adapter.js"
import { DICTIONARY, findEntry } from "./dictionary.js"

export class UnknownBindingError extends Error {
  constructor(public readonly keys: string[]) {
    super(`Unknown binding(s): ${keys.join(", ")}`)
    this.name = "UnknownBindingError"
  }
}

export class AnchorNotFoundError extends Error {
  constructor(anchor: string, id: string) {
    super(`No ${anchor} ${id}`)
    this.name = "AnchorNotFoundError"
  }
}

export class NoOptionsError extends Error {
  constructor(key: string) {
    super(`Binding ${key} has no option list`)
    this.name = "NoOptionsError"
  }
}

function entriesFor(keys: string[]) {
  const unknown = keys.filter((key) => !findEntry(key))
  if (unknown.length > 0) throw new UnknownBindingError(unknown)
  return keys.map((key) => findEntry(key)!)
}

function displayName(first: string | null, last: string | null) {
  return [first, last].filter(Boolean).join(" ") || "(no name)"
}

export class BindingService {
  constructor(private readonly clients: ClientStore) {}

  listBindings(anchor?: BindingAnchor): BindingDescriptor[] {
    return DICTIONARY.map((entry) => entry.descriptor).filter(
      (descriptor) => !anchor || descriptor.anchor === anchor,
    )
  }

  getBinding(key: string): BindingDescriptor {
    return entriesFor([key])[0].descriptor
  }

  async getOptions(key: string): Promise<BindingOptions> {
    const [entry] = entriesFor([key])
    if (entry.descriptor.control.kind !== "lookup") throw new NoOptionsError(key)
    // The only lookup in the prototype dictionary.
    return this.clients.listTitles()
  }

  async findClient(clientNumber: string): Promise<ClientAnchor | null> {
    const found = await this.clients.findByClientNumber(clientNumber)
    if (!found) return null
    return {
      id: found.id,
      clientNumber: found.clientNumber,
      displayName: displayName(found.firstName, found.lastName),
    }
  }

  async resolve(request: ResolveRequest): Promise<ResolveResponse> {
    const entries = entriesFor(request.bindings)
    const stored = await this.clients.get(request.anchor.client)
    if (!stored) throw new AnchorNotFoundError("client", request.anchor.client)

    const values: BoundValues = {}
    for (const entry of entries) {
      values[entry.descriptor.key] = stored.record[entry.property]
    }
    return { values, resolvedAt: new Date().toISOString() }
  }

  // Writes only what actually changed, and never overwrites a value that
  // changed in the store since the caller resolved it (reported as a
  // conflict instead). Everything that is written goes in one conditional
  // update, so a record changing mid-commit fails the whole write rather
  // than half-applying it.
  async commit(request: CommitRequest): Promise<CommitResponse> {
    const entries = entriesFor(Object.keys(request.values))
    const stored = await this.clients.get(request.anchor.client)
    if (!stored) throw new AnchorNotFoundError("client", request.anchor.client)

    const results: Record<string, BindingCommitResult> = {}
    const patch: Partial<Omit<ClientRecord, "clientNumber">> = {}
    const pending: string[] = []

    for (const entry of entries) {
      const key = entry.descriptor.key
      const next = normalise(request.values[key])
      const current = stored.record[entry.property]

      if (entry.descriptor.access === "read") {
        results[key] = { status: "readOnly" }
      } else if (next === current) {
        results[key] = { status: "unchanged" }
      } else if (
        request.baseline &&
        key in request.baseline &&
        normalise(request.baseline[key]) !== current
      ) {
        results[key] = {
          status: "conflict",
          message: "Changed in the source system since this form was opened",
          current,
        }
      } else {
        // Only read-only entries map to clientNumber, handled above.
        patch[entry.property as Exclude<typeof entry.property, "clientNumber">] =
          next
        pending.push(key)
      }
    }

    if (pending.length > 0) {
      try {
        await this.clients.update(request.anchor.client, patch, stored.etag)
        for (const key of pending) results[key] = { status: "written" }
      } catch (error) {
        if (
          !(error instanceof ConcurrentUpdateError) &&
          !(error instanceof StoreWriteError)
        ) {
          throw error
        }
        for (const key of pending) {
          results[key] = { status: "failed", message: error.message }
        }
      }
    }

    return { results }
  }
}

// Blank text means "no value" -- the store holds null, not "".
function normalise(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}
