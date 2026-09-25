import type {
  AttributeCandidate,
  BindingAnchor,
  BindingDescriptor,
  BindingOptions,
  ClientAnchor,
  CommitRequest,
  CommitResponse,
  CreateBindingRequest,
  ManagedBinding,
  ResolveRequest,
  ResolveResponse,
} from "shared"

// The Data Binding Service couldn't be reached or answered with an error.
// `status` is the DBS's own status where there was one (e.g. 404 for an
// unknown client), or 502 when it couldn't be reached at all.
export class BindingServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "BindingServiceError"
  }
}

// form-builder's only route to data-bound values: the DBS over HTTP. It
// never talks to ICIS (or any other backing store) itself.
export interface BindingClient {
  listBindings(anchor?: BindingAnchor): Promise<BindingDescriptor[]>
  getOptions(key: string): Promise<BindingOptions>
  findClient(clientNumber: string): Promise<ClientAnchor>
  resolve(request: ResolveRequest): Promise<ResolveResponse>
  commit(request: CommitRequest): Promise<CommitResponse>
  // The binding creator.
  listCandidates(anchor: BindingAnchor): Promise<AttributeCandidate[]>
  listManaged(): Promise<ManagedBinding[]>
  saveDraft(request: CreateBindingRequest): Promise<ManagedBinding>
  publish(key: string): Promise<ManagedBinding>
}

export class HttpBindingClient implements BindingClient {
  constructor(private readonly baseUrl: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
      })
    } catch {
      throw new BindingServiceError(502, "The Data Binding Service is unavailable")
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string
      } | null
      throw new BindingServiceError(
        res.status,
        body?.message ?? `Data Binding Service error ${res.status}`,
      )
    }
    return (await res.json()) as T
  }

  listBindings(anchor?: BindingAnchor) {
    const qs = anchor ? `?anchor=${anchor}` : ""
    return this.call<BindingDescriptor[]>(`/bindings${qs}`)
  }

  getOptions(key: string) {
    return this.call<BindingOptions>(
      `/bindings/${encodeURIComponent(key)}/options`,
    )
  }

  findClient(clientNumber: string) {
    return this.call<ClientAnchor>(
      `/anchors/client?clientNumber=${encodeURIComponent(clientNumber)}`,
    )
  }

  resolve(request: ResolveRequest) {
    return this.call<ResolveResponse>("/resolve", {
      method: "POST",
      body: JSON.stringify(request),
    })
  }

  commit(request: CommitRequest) {
    return this.call<CommitResponse>("/commit", {
      method: "POST",
      body: JSON.stringify(request),
    })
  }

  listCandidates(anchor: BindingAnchor) {
    return this.call<AttributeCandidate[]>(`/admin/attributes?anchor=${anchor}`)
  }

  listManaged() {
    return this.call<ManagedBinding[]>("/admin/bindings")
  }

  saveDraft(request: CreateBindingRequest) {
    return this.call<ManagedBinding>("/admin/bindings", {
      method: "POST",
      body: JSON.stringify(request),
    })
  }

  publish(key: string) {
    return this.call<ManagedBinding>(
      `/admin/bindings/${encodeURIComponent(key)}/publish`,
      { method: "POST", body: "{}" },
    )
  }
}
