import type {
  AnchorContext,
  BindingDescriptor,
  BindingOptions,
  BoundValues,
  CaseContext,
  CommitResponse,
  ResolveResponse,
} from "shared"

// The portal's only way to reach client data: the Data Binding Service,
// relayed at /dbs (vite.config.ts). It never talks to ICIS, and holds only
// DBS-issued IDs and option codes -- no Dataverse IDs anywhere.
//
// Every call is recorded so the developer panel can show exactly what went
// over the wire.

export interface DbsCall {
  id: number
  at: Date
  method: string
  path: string
  body?: unknown
  status: number | null
  response?: unknown
  ms: number
  // A one-line summary for the panel.
  summary: string
}

export class DbsError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "DbsError"
  }
}

const BASE = "/dbs"
const calls: DbsCall[] = []
const listeners = new Set<() => void>()
let nextId = 1

export function dbsCalls(): DbsCall[] {
  return calls
}

export function onDbsCall(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function clearDbsCalls() {
  calls.length = 0
  listeners.forEach((l) => l())
}

async function call<T>(method: string, path: string, summary: string, body?: unknown): Promise<T> {
  const started = performance.now()
  const entry: DbsCall = { id: nextId++, at: new Date(), method, path, body, status: null, ms: 0, summary }
  calls.unshift(entry)
  if (calls.length > 200) calls.length = 200
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    entry.status = res.status
    const data = await res.json().catch(() => null)
    entry.response = data
    if (!res.ok) {
      throw new DbsError(
        res.status,
        (data as { message?: string } | null)?.message ??
          (res.status >= 500 ? "The Data Binding Service is unavailable" : res.statusText),
      )
    }
    return data as T
  } catch (error) {
    if (error instanceof DbsError) throw error
    entry.response = { error: String(error) }
    throw new DbsError(0, "The Data Binding Service is unavailable")
  } finally {
    entry.ms = Math.round(performance.now() - started)
    listeners.forEach((l) => l())
  }
}

const anchorSummary = (anchor: AnchorContext) =>
  Object.keys(anchor)
    .filter((k) => anchor[k as keyof AnchorContext])
    .join(" + ")

// The dictionary is fetched once per page load; a binding a steward
// publishes later shows up on the next load.
let dictionary: Promise<Map<string, BindingDescriptor>> | null = null

export function bindingDictionary(): Promise<Map<string, BindingDescriptor>> {
  if (!dictionary) {
    dictionary = call<BindingDescriptor[]>("GET", "/bindings", "The binding dictionary").then(
      (list) => new Map(list.map((d) => [d.key, d])),
    )
    dictionary.catch(() => (dictionary = null))
  }
  return dictionary
}

// Options by the descriptor's own link -- the portal doesn't know the
// DBS's URL conventions, it follows what the descriptor says.
const optionLists = new Map<string, Promise<BindingOptions>>()

export function optionsFor(descriptor: BindingDescriptor): Promise<BindingOptions> {
  const href = descriptor.options?.href ?? `/bindings/${encodeURIComponent(descriptor.key)}/options`
  let list = optionLists.get(href)
  if (!list) {
    list = call<BindingOptions>("GET", href, `Options for ${descriptor.key}`)
    list.catch(() => optionLists.delete(href))
    optionLists.set(href, list)
  }
  return list
}

export const dbs = {
  // A case, its clients, and every session regarding it with each one's
  // participants -- the anchors a session note resolves against.
  findCase: (caseNumber: string) =>
    call<CaseContext>(
      "GET",
      `/anchors/case?caseNumber=${encodeURIComponent(caseNumber)}`,
      `Open case ${caseNumber}`,
    ),

  resolve: (anchor: AnchorContext, bindings: string[]) =>
    call<ResolveResponse>(
      "POST",
      "/resolve",
      `Resolve ${bindings.length} binding${bindings.length === 1 ? "" : "s"} on ${anchorSummary(anchor)}`,
      { anchor, bindings },
    ),

  commit: (anchor: AnchorContext, values: BoundValues, baseline: BoundValues) =>
    call<CommitResponse>(
      "POST",
      "/commit",
      `Commit ${Object.keys(values).length} value${Object.keys(values).length === 1 ? "" : "s"} on ${anchorSummary(anchor)}`,
      { anchor, values, baseline },
    ),
}
