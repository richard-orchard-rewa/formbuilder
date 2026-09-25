import type { BindingOptions } from "shared"
import {
  ConcurrentUpdateError,
  StoreWriteError,
  type ClientRecord,
  type ClientStore,
  type ClientSummary,
  type StoredClient,
} from "./adapter.js"
import { KNOWN_TITLES } from "./fake.js"

// The anti-corruption boundary: the only code that knows ICIS column names,
// OData syntax and Dataverse's error shapes. Talks to the Dataverse Web API
// with plain fetch -- the prototype's surface (one entity read, one PATCH,
// one lookup list) doesn't justify a client library.

const API = "/api/data/v9.2"
const CONTACT_SELECT = "csg_clientid,firstname,lastname,_csg_salutationid_value"
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface DataverseContact {
  "@odata.etag"?: string
  contactid: string
  csg_clientid: string | null
  firstname: string | null
  lastname: string | null
  _csg_salutationid_value: string | null
}

export type Fetch = typeof fetch

export class IcisClientStore implements ClientStore {
  constructor(
    private readonly orgUrl: string,
    private readonly getToken: () => Promise<string>,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}) {
    return this.fetchImpl(`${this.orgUrl}${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.getToken()}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
    })
  }

  private async getJson<T>(path: string): Promise<T | null> {
    const res = await this.request(path)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`ICIS ${res.status}: ${await errorMessage(res)}`)
    return (await res.json()) as T
  }

  async findByClientNumber(clientNumber: string): Promise<ClientSummary | null> {
    // Client numbers are digits; refusing anything else keeps the value out
    // of the OData filter string entirely rather than escaping it.
    if (!/^\d{1,20}$/.test(clientNumber)) return null
    const result = await this.getJson<{ value: DataverseContact[] }>(
      `/contacts?$select=contactid,${CONTACT_SELECT}&$filter=csg_clientid eq '${clientNumber}'&$top=2`,
    )
    const [match, second] = result?.value ?? []
    // Ambiguous: better to find nothing than anchor on the wrong person.
    if (!match || second) return null
    return {
      id: match.contactid,
      clientNumber: match.csg_clientid,
      firstName: match.firstname,
      lastName: match.lastname,
    }
  }

  async get(id: string): Promise<StoredClient | null> {
    if (!GUID.test(id)) return null
    const contact = await this.getJson<DataverseContact>(
      `/contacts(${id})?$select=${CONTACT_SELECT}`,
    )
    if (!contact) return null
    return {
      etag: contact["@odata.etag"] ?? "",
      record: {
        clientNumber: contact.csg_clientid,
        titleId: contact._csg_salutationid_value,
        firstName: contact.firstname,
        lastName: contact.lastname,
      },
    }
  }

  async update(
    id: string,
    patch: Partial<Omit<ClientRecord, "clientNumber">>,
    etag: string,
  ): Promise<void> {
    if (!GUID.test(id)) throw new StoreWriteError("Invalid client id")
    const body: Record<string, unknown> = {}
    if ("firstName" in patch) body.firstname = patch.firstName
    if ("lastName" in patch) body.lastname = patch.lastName
    const clearTitle = "titleId" in patch && patch.titleId === null
    if (patch.titleId) {
      if (!GUID.test(patch.titleId)) throw new StoreWriteError("Invalid title")
      body["csg_salutationid@odata.bind"] = `/csg_salutations(${patch.titleId})`
    }

    if (Object.keys(body).length > 0) {
      // If-Match makes the write conditional on the row version read before
      // it; Dataverse answers 412 if anything changed in between.
      const res = await this.request(`/contacts(${id})`, {
        method: "PATCH",
        headers: { "If-Match": etag },
        body: JSON.stringify(body),
      })
      await throwIfWriteFailed(res)
    }
    if (clearTitle) {
      // Clearing a lookup is a disassociation, not a PATCH to null.
      const res = await this.request(`/contacts(${id})/csg_salutationid/$ref`, {
        method: "DELETE",
      })
      await throwIfWriteFailed(res)
    }
  }

  async listTitles(): Promise<BindingOptions> {
    const res = await this.request(
      "/csg_salutations?$select=csg_salutationid,csg_name&$filter=statecode eq 0&$orderby=csg_name",
    )
    // The prototype's app user lacks read on csg_salutation in test ICIS;
    // serve the known list rather than an empty dropdown, and say so.
    if (res.status === 403) return { options: KNOWN_TITLES, source: "fallback" }
    if (!res.ok) throw new Error(`ICIS ${res.status}: ${await errorMessage(res)}`)
    const data = (await res.json()) as {
      value: Array<{ csg_salutationid: string; csg_name: string }>
    }
    return {
      source: "live",
      options: data.value.map((row) => ({
        value: row.csg_salutationid,
        label: row.csg_name,
      })),
    }
  }
}

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string }
  } | null
  return body?.error?.message ?? res.statusText
}

async function throwIfWriteFailed(res: Response) {
  if (res.ok) return
  if (res.status === 412) throw new ConcurrentUpdateError()
  const message = await errorMessage(res)
  if (res.status === 403) {
    // Dataverse's privilege errors embed principal and business-unit IDs;
    // pass on only which privilege is missing.
    const privilege = /missing (\w+) privilege/.exec(message)?.[1]
    throw new StoreWriteError(
      `ICIS refused the update: the Data Binding Service's account is missing ${privilege ?? "a required"} privilege`,
    )
  }
  throw new StoreWriteError(`ICIS refused the update (${res.status})`)
}
