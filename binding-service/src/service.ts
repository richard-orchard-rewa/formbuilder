import type {
  AnchorContext,
  BindingAnchor,
  BindingCommitResult,
  BindingDescriptor,
  BindingOptions,
  BoundValues,
  CaseAnchor,
  CaseContext,
  ClientAnchor,
  CommitRequest,
  CommitResponse,
  ResolveRequest,
  ResolveResponse,
  SessionAnchor,
  SessionContext,
} from "shared"
import {
  ConcurrentUpdateError,
  StoreWriteError,
  optionListOf,
  type BindingSource,
  type CaseSummary,
  type Change,
  type ClientSummary,
  type RecordStore,
  type SessionSummary,
  type StoredRecord,
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

export class NoOptionsError extends Error {
  constructor(key: string) {
    super(`Binding ${key} has no option list`)
    this.name = "NoOptionsError"
  }
}

// A request named bindings on an anchor it didn't give an ID for.
export class MissingAnchorError extends Error {
  constructor(anchor: BindingAnchor, keys: string[]) {
    super(`${keys.join(", ")} need a ${anchor} anchor, and none was given`)
    this.name = "MissingAnchorError"
  }
}

function displayName(first: string | null, last: string | null) {
  return [first, last].filter(Boolean).join(" ") || "(no name)"
}

// One anchor's share of a resolve or commit: the store record it names,
// read once, and the bindings on it.
interface AnchorGroup {
  anchor: BindingAnchor
  recordId: string
  entries: DictionaryEntry[]
  stored: StoredRecord
}

type OptionLists = (source: BindingSource) => Promise<BindingOptions>

// The runtime half of the DBS: what forms use to render, fill and submit
// data-bound fields. The creator (creator.ts) is the build-time half.
//
// Everything that crosses this boundary uses the DBS's own identities, never
// the store's: a client, case, session or participant is a DBS-issued
// anchor ID, and a lookup or choice value is an option code (identity.ts).
// Translation to and from the store's IDs happens here, and only here.
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
    if (!optionListOf(entry.source)) throw new NoOptionsError(key)
    return this.codedOptions(entry.source)
  }

  // --- Anchors: finding the records forms are about, and walking from a
  // case to its clients and sessions. Every ID handed out is the DBS's. ---

  async findClient(clientNumber: string): Promise<ClientAnchor | null> {
    const found = await this.store.findClientByNumber(clientNumber)
    return found ? this.clientAnchor(found) : null
  }

  async findCase(caseNumber: string): Promise<CaseAnchor | null> {
    const found = await this.store.findCaseByNumber(caseNumber)
    return found ? this.caseAnchor(found) : null
  }

  async caseContext(anchorId: string): Promise<CaseContext> {
    const record = await this.store.readCase(await this.recordIdFor("case", anchorId))
    if (!record) throw new AnchorNotFoundError("case", anchorId)
    return {
      ...(await this.caseAnchor(record)),
      clients: await Promise.all(
        record.clients.map(async (c) => ({ ...(await this.clientAnchor(c)), primary: c.primary })),
      ),
      sessions: await Promise.all(record.sessions.map((s) => this.sessionAnchor(s))),
    }
  }

  async sessionContext(anchorId: string): Promise<SessionContext> {
    const record = await this.store.readSession(await this.recordIdFor("session", anchorId))
    if (!record) throw new AnchorNotFoundError("session", anchorId)
    return {
      ...(await this.sessionAnchor(record)),
      case: record.case ? await this.caseAnchor(record.case) : null,
      participants: await Promise.all(
        record.participants.map(async (p) => ({
          id: await this.identities.anchorFor("sessionParticipant", this.store.name, p.id),
          client: await this.clientAnchor(p.client),
        })),
      ),
    }
  }

  private async clientAnchor(found: ClientSummary): Promise<ClientAnchor> {
    return {
      id: await this.identities.anchorFor("client", this.store.name, found.id),
      clientNumber: found.clientNumber,
      displayName: displayName(found.firstName, found.lastName),
    }
  }

  private async caseAnchor(found: CaseSummary): Promise<CaseAnchor> {
    return {
      id: await this.identities.anchorFor("case", this.store.name, found.id),
      caseNumber: found.caseNumber,
      displayName: found.title ?? `Case ${found.caseNumber ?? ""}`.trim(),
    }
  }

  private async sessionAnchor(found: SessionSummary): Promise<SessionAnchor> {
    return {
      id: await this.identities.anchorFor("session", this.store.name, found.id),
      subject: found.subject ?? "(no subject)",
      scheduledStart: found.scheduledStart,
      status: found.status,
    }
  }

  // --- Values. ---

  // Current values for bindings on one or more anchors: one store read per
  // anchor, whatever the number of bindings on it.
  async resolve(request: ResolveRequest): Promise<ResolveResponse> {
    const groups = await this.readGroups(request.anchor, await this.entriesFor(request.bindings))
    const options = this.optionCache()
    const values: BoundValues = {}
    for (const group of groups) {
      for (const entry of group.entries) {
        values[entry.descriptor.key] = await this.fromStore(
          entry.source,
          group.stored.values[entry.source.attribute] ?? null,
          options,
        )
      }
    }
    return { values, resolvedAt: new Date().toISOString() }
  }

  // Writes only what actually changed, and never overwrites a value that
  // changed in the store since the caller resolved it (reported as a
  // conflict instead). Every value is checked against its binding's
  // validation here, at the API boundary, whatever the rendered form did
  // (requirements §3).
  // Everything written to one anchor's record goes in one conditional
  // update, so a record changing mid-commit fails that write rather than
  // half-applying it. A commit spanning anchors (a session and its case)
  // is one write per record, so one can succeed while another fails; the
  // per-binding results say which.
  async commit(request: CommitRequest): Promise<CommitResponse> {
    const groups = await this.readGroups(
      request.anchor,
      await this.entriesFor(Object.keys(request.values)),
    )
    const results: Record<string, BindingCommitResult> = {}
    const options = this.optionCache()
    for (const group of groups) {
      Object.assign(results, await this.commitGroup(group, request, options))
    }
    return { results }
  }

  private async commitGroup(
    group: AnchorGroup,
    request: CommitRequest,
    options: OptionLists,
  ): Promise<Record<string, BindingCommitResult>> {
    const results: Record<string, BindingCommitResult> = {}
    const changes: Change[] = []
    const pending: string[] = []

    for (const entry of group.entries) {
      const { descriptor, source } = entry
      const key = descriptor.key
      const next = normalise(request.values[key])
      const current = await this.fromStore(
        source,
        group.stored.values[source.attribute] ?? null,
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
        await this.store.write(
          ANCHOR_ENTITIES[group.anchor],
          group.recordId,
          changes,
          group.stored.etag,
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
    return results
  }

  // Splits bindings by the anchor they're about and reads each anchor's
  // record once. Every anchor a binding needs must be in the request.
  private async readGroups(
    anchor: AnchorContext,
    entries: DictionaryEntry[],
  ): Promise<AnchorGroup[]> {
    const byAnchor = new Map<BindingAnchor, DictionaryEntry[]>()
    for (const entry of entries) {
      const list = byAnchor.get(entry.descriptor.anchor) ?? []
      list.push(entry)
      byAnchor.set(entry.descriptor.anchor, list)
    }
    return Promise.all(
      [...byAnchor].map(async ([type, list]) => {
        const anchorId = anchor[type]
        if (!anchorId) {
          throw new MissingAnchorError(
            type,
            list.map((e) => e.descriptor.key),
          )
        }
        const recordId = await this.recordIdFor(type, anchorId)
        const stored = await this.store.read(
          ANCHOR_ENTITIES[type],
          recordId,
          list.map((e) => e.source),
        )
        if (!stored) throw new AnchorNotFoundError(type, anchorId)
        return { anchor: type, recordId, entries: list, stored }
      }),
    )
  }

  // The store's record behind a DBS anchor ID of the given kind.
  private async recordIdFor(anchor: BindingAnchor, anchorId: string): Promise<string> {
    const recordId = await this.identities.storeIdForAnchor(anchorId, this.store.name, anchor)
    if (!recordId) throw new AnchorNotFoundError(anchor, anchorId)
    return recordId
  }

  // A lookup's or choice's options with codes in place of the store's own
  // values, assigning codes to options seen for the first time.
  private async codedOptions(source: BindingSource): Promise<BindingOptions> {
    const listKey = optionListOf(source)!
    const list =
      source.strategy === "choice"
        ? await this.store.choiceOptions(source.entity, source.attribute)
        : await this.store.lookupOptions(source.target!)
    const codes = await this.identities.codesFor(
      listKey,
      this.store.name,
      list.options.map((o) => ({ storeId: o.value, label: o.label })),
    )
    return {
      ...list,
      options: list.options.map((o, i) => ({ value: codes[i], label: o.label })),
    }
  }

  // Coded option lists, fetched at most once per request.
  private optionCache(): OptionLists {
    const lists = new Map<string, Promise<BindingOptions>>()
    return (source) => {
      const key = optionListOf(source)!
      if (!lists.has(key)) lists.set(key, this.codedOptions(source))
      return lists.get(key)!
    }
  }

  // A store value as the DBS presents it: a lookup's row ID or a choice's
  // option value becomes its code.
  private async fromStore(
    source: BindingSource,
    value: string | null,
    options: OptionLists,
  ): Promise<string | null> {
    const list = optionListOf(source)
    if (value === null || !list) return value
    const store = this.store.name
    const known = await this.identities.codeForStoreId(list, store, value)
    if (known) return known
    // Not seen yet: listing the options assigns codes to every current one.
    await options(source)
    const listed = await this.identities.codeForStoreId(list, store, value)
    if (listed) return listed
    // A row the list doesn't offer (e.g. deactivated) still gets a stable code.
    const [code] = await this.identities.codesFor(list, store, [
      { storeId: value, label: `ref-${value.slice(0, 8)}` },
    ])
    return code
  }

  // A DBS value as the store needs it: a code becomes the store's own value.
  // undefined: the code means nothing in this store.
  private async toStore(
    source: BindingSource,
    value: string | null,
  ): Promise<string | null | undefined> {
    const list = optionListOf(source)
    if (value === null || !list) return value
    const storeId = await this.identities.storeIdForCode(list, this.store.name, value)
    return storeId ?? undefined
  }

  // Why a changed value can't be written, or null.
  private async validate(
    entry: DictionaryEntry,
    value: string | null,
    options: OptionLists,
  ) {
    const validation = entry.descriptor.validation
    if (value === null) {
      return validation?.required ? "A value is required here" : null
    }
    return firstFailure(value, validation?.rules ?? [], {
      options: optionListOf(entry.source) ? () => options(entry.source) : undefined,
    })
  }
}

// Blank text means "no value" -- the store holds null, not "".
function normalise(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}
