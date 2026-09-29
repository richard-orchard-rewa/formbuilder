import type {
  AnchorContext,
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
  SessionAnchor,
} from "shared"
import {
  ConcurrentUpdateError,
  StoreWriteError,
  type BindingSource,
  type Change,
  type ClientSummary,
  type RecordStore,
} from "./adapters/adapter.js"
import { ANCHOR_ENTITIES } from "./allow-list.js"
import { firstFailure } from "./validators.js"
import type { DictionaryEntry } from "./dictionary.js"
import type { IdentityRegistry } from "./identity.js"
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

// A binding asked for against the wrong kind of record -- a participant's
// attendance resolved against a client, say.
export class AnchorMismatchError extends Error {
  constructor(
    public readonly anchor: BindingAnchor,
    public readonly keys: string[],
  ) {
    super(`Not ${anchor} binding(s): ${keys.join(", ")}`)
    this.name = "AnchorMismatchError"
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
//
// Everything that crosses this boundary uses the DBS's own identities, never
// the store's: a client is a DBS-issued anchor ID and a lookup value is an
// option code (identity.ts). Translation to and from the store's IDs
// happens here, and only here.
export class BindingService {
  constructor(
    private readonly store: RecordStore,
    private readonly registry: BindingRegistry,
    private readonly identities: IdentityRegistry,
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
    if (entry.source.strategy === "attribute" || !entry.source.target) {
      throw new NoOptionsError(key)
    }
    return this.codedOptions(entry.source.target)
  }

  async findClient(clientNumber: string): Promise<ClientAnchor | null> {
    const found = await this.store.findClientByNumber(clientNumber)
    return found ? this.clientAnchor(found) : null
  }

  // A client's sessions, each with everyone who took part. Sessions,
  // participants and clients all come back as DBS anchor IDs: a participant
  // anchor is the one person's attendance at that session, so data captured
  // for them is written back to -- and read back from -- that person only.
  async findSessions(clientNumber: string): Promise<SessionAnchor[] | null> {
    const client = await this.store.findClientByNumber(clientNumber)
    if (!client) return null
    const store = this.store.name
    const sessions = await this.store.sessionsForClient(client.id)
    return Promise.all(
      sessions.map(async (session) => ({
        id: await this.identities.anchorFor("session", store, session.id),
        subject: session.subject,
        start: session.start,
        end: session.end,
        participants: await Promise.all(
          session.participants.map(async (p) => ({
            id: await this.identities.anchorFor("participant", store, p.id),
            client: await this.clientAnchor(p.client),
            attendance: p.attendanceLabel,
          })),
        ),
      })),
    )
  }

  private async clientAnchor(found: ClientSummary): Promise<ClientAnchor> {
    return {
      id: await this.identities.anchorFor("client", this.store.name, found.id),
      clientNumber: found.clientNumber,
      displayName: displayName(found.firstName, found.lastName),
    }
  }

  async resolve(request: ResolveRequest): Promise<ResolveResponse> {
    const entries = await this.entriesFor(request.bindings)
    const { stored } = await this.readAnchor(request.anchor, entries)

    const options = this.optionCache()
    const values: BoundValues = {}
    for (const entry of entries) {
      values[entry.descriptor.key] = await this.fromStore(
        entry.source,
        stored.values[entry.source.attribute] ?? null,
        options,
      )
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
    const { entity, recordId, stored } = await this.readAnchor(request.anchor, entries)

    const results: Record<string, BindingCommitResult> = {}
    const changes: Change[] = []
    const pending: string[] = []
    const options = this.optionCache()

    for (const entry of entries) {
      const { descriptor, source } = entry
      const key = descriptor.key
      const next = normalise(request.values[key])
      const current = await this.fromStore(
        source,
        stored.values[source.attribute] ?? null,
        options,
      )

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
        const failure = await this.validate(entry, next, options)
        const storeValue = failure ? null : await this.toStore(source, next)
        if (failure || storeValue === undefined) {
          results[key] = {
            status: "failed",
            message: failure ?? "Not one of the allowed options",
          }
        } else {
          changes.push({ source, value: storeValue })
          pending.push(key)
        }
      }
    }

    if (changes.length > 0) {
      try {
        await this.store.write(entity, recordId, changes, stored.etag)
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

  // The store record behind a DBS anchor ID, read for `entries` -- which
  // must all be bindings on that kind of anchor.
  private async readAnchor(context: AnchorContext, entries: DictionaryEntry[]) {
    const [anchor, anchorId] = Object.entries(context)[0] as [BindingAnchor, string]
    const wrong = entries.filter((e) => e.descriptor.anchor !== anchor)
    if (wrong.length > 0) {
      throw new AnchorMismatchError(
        anchor,
        wrong.map((e) => e.descriptor.key),
      )
    }
    const recordId = await this.identities.storeIdForAnchor(anchorId, this.store.name, anchor)
    if (!recordId) throw new AnchorNotFoundError(anchor, anchorId)
    const entity = ANCHOR_ENTITIES[anchor]
    const stored = await this.store.read(
      entity,
      recordId,
      entries.map((e) => e.source),
    )
    if (!stored) throw new AnchorNotFoundError(anchor, anchorId)
    return { entity, recordId, stored }
  }

  // A lookup's options with codes in place of the store's row IDs,
  // assigning codes to rows seen for the first time.
  private async codedOptions(target: string): Promise<BindingOptions> {
    const list = await this.store.lookupOptions(target)
    const codes = await this.identities.codesFor(
      target,
      this.store.name,
      list.options.map((o) => ({ storeId: o.value, label: o.label })),
    )
    return {
      ...list,
      options: list.options.map((o, i) => ({ value: codes[i], label: o.label })),
    }
  }

  // Coded option lists, fetched at most once per request.
  private optionCache() {
    const lists = new Map<string, Promise<BindingOptions>>()
    return (target: string) => {
      if (!lists.has(target)) lists.set(target, this.codedOptions(target))
      return lists.get(target)!
    }
  }

  // A store value as the DBS presents it: a lookup's row ID (or a choice's
  // integer) becomes its code.
  private async fromStore(
    source: BindingSource,
    value: string | null,
    options: (target: string) => Promise<BindingOptions>,
  ): Promise<string | null> {
    if (value === null || source.strategy === "attribute" || !source.target) return value
    const store = this.store.name
    const known = await this.identities.codeForStoreId(source.target, store, value)
    if (known) return known
    // Not seen yet: listing the options assigns codes to every current row.
    await options(source.target)
    const listed = await this.identities.codeForStoreId(source.target, store, value)
    if (listed) return listed
    // A row the list doesn't offer (e.g. deactivated) still gets a stable code.
    const [code] = await this.identities.codesFor(source.target, store, [
      { storeId: value, label: `ref-${value.slice(0, 8)}` },
    ])
    return code
  }

  // A DBS value as the store needs it: a code becomes the store's row ID.
  // undefined: the code means nothing in this store.
  private async toStore(
    source: BindingSource,
    value: string | null,
  ): Promise<string | null | undefined> {
    if (value === null || source.strategy === "attribute" || !source.target) return value
    const storeId = await this.identities.storeIdForCode(source.target, this.store.name, value)
    return storeId ?? undefined
  }

  // Why a changed value can't be written, or null.
  private async validate(
    entry: DictionaryEntry,
    value: string | null,
    options: (target: string) => Promise<BindingOptions>,
  ) {
    const validation = entry.descriptor.validation
    if (value === null) {
      return validation?.required ? "A value is required here" : null
    }
    const target = entry.source.target
    return firstFailure(value, validation?.rules ?? [], {
      options: target ? () => options(target) : undefined,
    })
  }
}

// Blank text means "no value" -- the store holds null, not "".
function normalise(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}
