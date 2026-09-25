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
  type Change,
  type RecordStore,
} from "./adapters/adapter.js"
import { ANCHOR_ENTITIES } from "./allow-list.js"
import { firstFailure } from "./validators.js"
import type { DictionaryEntry } from "./dictionary.js"
import type { BindingRegistry } from "./registry.js"

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

function displayName(first: string | null, last: string | null) {
  return [first, last].filter(Boolean).join(" ") || "(no name)"
}

// The runtime half of the DBS: what forms use to render, fill and submit
// data-bound fields. The creator (creator.ts) is the build-time half.
export class BindingService {
  constructor(
    private readonly store: RecordStore,
    private readonly registry: BindingRegistry,
  ) {}

  private async entriesFor(keys: string[]): Promise<DictionaryEntry[]> {
    const published = await this.registry.published()
    const byKey = new Map(published.map((e) => [e.descriptor.key, e]))
    const unknown = keys.filter((key) => !byKey.has(key))
    if (unknown.length > 0) throw new UnknownBindingError(unknown)
    return keys.map((key) => byKey.get(key)!)
  }

  async listBindings(anchor?: BindingAnchor): Promise<BindingDescriptor[]> {
    return (await this.registry.published(anchor)).map((e) => e.descriptor)
  }

  async getBinding(key: string): Promise<BindingDescriptor> {
    return (await this.entriesFor([key]))[0].descriptor
  }

  async getOptions(key: string): Promise<BindingOptions> {
    const [entry] = await this.entriesFor([key])
    if (entry.source.strategy !== "lookup" || !entry.source.target) {
      throw new NoOptionsError(key)
    }
    return this.store.lookupOptions(entry.source.target)
  }

  async findClient(clientNumber: string): Promise<ClientAnchor | null> {
    const found = await this.store.findClientByNumber(clientNumber)
    if (!found) return null
    return {
      id: found.id,
      clientNumber: found.clientNumber,
      displayName: displayName(found.firstName, found.lastName),
    }
  }

  async resolve(request: ResolveRequest): Promise<ResolveResponse> {
    const entries = await this.entriesFor(request.bindings)
    const stored = await this.store.read(
      ANCHOR_ENTITIES.client,
      request.anchor.client,
      entries.map((e) => e.source),
    )
    if (!stored) throw new AnchorNotFoundError("client", request.anchor.client)

    const values: BoundValues = {}
    for (const entry of entries) {
      values[entry.descriptor.key] = stored.values[entry.source.attribute] ?? null
    }
    return { values, resolvedAt: new Date().toISOString() }
  }

  // Writes only what actually changed, and never overwrites a value that
  // changed in the store since the caller resolved it (reported as a
  // conflict instead). Every value is checked against its binding's
  // validation here, at the API boundary, whatever the rendered form did
  // (requirements §3).
  // Everything written goes in one conditional update, so a record changing
  // mid-commit fails the whole write rather than half-applying it.
  async commit(request: CommitRequest): Promise<CommitResponse> {
    const entries = await this.entriesFor(Object.keys(request.values))
    const stored = await this.store.read(
      ANCHOR_ENTITIES.client,
      request.anchor.client,
      entries.map((e) => e.source),
    )
    if (!stored) throw new AnchorNotFoundError("client", request.anchor.client)

    const results: Record<string, BindingCommitResult> = {}
    const changes: Change[] = []
    const pending: string[] = []
    // Each lookup's options, fetched at most once per commit.
    const optionLists = new Map<string, Promise<BindingOptions>>()
    const optionsFor = (target: string) => {
      if (!optionLists.has(target)) {
        optionLists.set(target, this.store.lookupOptions(target))
      }
      return optionLists.get(target)!
    }

    for (const entry of entries) {
      const { descriptor, source } = entry
      const key = descriptor.key
      const next = normalise(request.values[key])
      const current = stored.values[source.attribute] ?? null

      if (descriptor.access === "read") {
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
        const failure = await this.validate(entry, next, optionsFor)
        if (failure) {
          results[key] = { status: "failed", message: failure }
        } else {
          changes.push({ source, value: next })
          pending.push(key)
        }
      }
    }

    if (changes.length > 0) {
      try {
        await this.store.write(
          ANCHOR_ENTITIES.client,
          request.anchor.client,
          changes,
          stored.etag,
        )
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

  // Why a changed value can't be written, or null.
  private async validate(
    entry: DictionaryEntry,
    value: string | null,
    optionsFor: (target: string) => Promise<BindingOptions>,
  ) {
    const validation = entry.descriptor.validation
    if (value === null) {
      return validation?.required ? "A value is required here" : null
    }
    const target = entry.source.target
    return firstFailure(value, validation?.rules ?? [], {
      options: target ? () => optionsFor(target) : undefined,
    })
  }
}

// Blank text means "no value" -- the store holds null, not "".
function normalise(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}
