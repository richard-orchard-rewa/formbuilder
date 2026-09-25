import type { BindingOptions } from "shared"
import {
  ConcurrentUpdateError,
  StoreWriteError,
  type AttributeMetadata,
  type BindingSource,
  type Change,
  type ClientSummary,
  type RecordStore,
  type ServicePermissions,
  type StoreValue,
  type StoredRecord,
} from "./adapter.js"
import { KNOWN_TITLES } from "./fake.js"

// The anti-corruption boundary: the only code that knows Dataverse's URL
// shapes, OData syntax, lookup-binding rules and error formats. Plain fetch
// + MSAL -- the surface (entity reads/PATCHes, metadata, one privilege
// query) doesn't justify a client library.

const API = "/api/data/v9.2"
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Logical names only ever come from the allow-list and the code dictionary,
// but they're interpolated into URLs, so refuse anything else outright.
const LOGICAL_NAME = /^[a-z][a-z0-9_]*$/
const DEFAULT_PRIVILEGE_TTL_MS = 60_000

interface EntityInfo {
  entitySet: string
  primaryId: string
  primaryName: string
  // Privilege names by type, e.g. { Read: "prvReadContact" }.
  privileges: Record<string, string>
}

interface Label {
  UserLocalizedLabel?: { Label?: string } | null
}

export type Fetch = typeof fetch

export class IcisRecordStore implements RecordStore {
  private readonly entities = new Map<string, Promise<EntityInfo>>()
  private readonly navProperties = new Map<string, Promise<string>>()
  private privilegeCache: { at: number; names: Promise<Set<string>> } | null = null

  constructor(
    private readonly orgUrl: string,
    private readonly getToken: () => Promise<string>,
    private readonly fetchImpl: Fetch = fetch,
    // How long the account's own privileges are cached. 0 re-checks on every
    // request -- handy when demonstrating privilege changes live.
    private readonly privilegeTtlMs = DEFAULT_PRIVILEGE_TTL_MS,
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

  private entity(logicalName: string): Promise<EntityInfo> {
    let info = this.entities.get(logicalName)
    if (!info) {
      info = (async () => {
        const meta = await this.getJson<{
          EntitySetName: string
          PrimaryIdAttribute: string
          PrimaryNameAttribute: string
          Privileges: Array<{ Name: string; PrivilegeType: string }>
        }>(
          `/EntityDefinitions(LogicalName='${checkName(logicalName)}')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,Privileges`,
        )
        if (!meta) throw new Error(`ICIS has no entity ${logicalName}`)
        return {
          entitySet: meta.EntitySetName,
          primaryId: meta.PrimaryIdAttribute,
          primaryName: meta.PrimaryNameAttribute,
          privileges: Object.fromEntries(
            meta.Privileges.map((p) => [p.PrivilegeType, p.Name]),
          ),
        }
      })()
      info.catch(() => this.entities.delete(logicalName))
      this.entities.set(logicalName, info)
    }
    return info
  }

  // A lookup is written through its single-valued navigation property,
  // whose name isn't always the attribute's logical name.
  private navProperty(entity: string, source: BindingSource): Promise<string> {
    const cacheKey = `${entity}.${source.attribute}`
    let nav = this.navProperties.get(cacheKey)
    if (!nav) {
      nav = (async () => {
        const result = await this.getJson<{
          value: Array<{ ReferencingEntityNavigationPropertyName: string }>
        }>(
          `/EntityDefinitions(LogicalName='${checkName(entity)}')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName&$filter=ReferencingAttribute eq '${checkName(source.attribute)}'`,
        )
        const name = result?.value[0]?.ReferencingEntityNavigationPropertyName
        if (!name) throw new Error(`No relationship for ${cacheKey}`)
        return name
      })()
      nav.catch(() => this.navProperties.delete(cacheKey))
      this.navProperties.set(cacheKey, nav)
    }
    return nav
  }

  async findClientByNumber(clientNumber: string): Promise<ClientSummary | null> {
    // Client numbers are digits; refusing anything else keeps the value out
    // of the OData filter string entirely rather than escaping it.
    if (!/^\d{1,20}$/.test(clientNumber)) return null
    const result = await this.getJson<{
      value: Array<{
        contactid: string
        csg_clientid: string | null
        firstname: string | null
        lastname: string | null
      }>
    }>(
      `/contacts?$select=contactid,csg_clientid,firstname,lastname&$filter=csg_clientid eq '${clientNumber}'&$top=2`,
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

  async read(
    entity: string,
    id: string,
    sources: BindingSource[],
  ): Promise<StoredRecord | null> {
    if (!GUID.test(id)) return null
    const { entitySet } = await this.entity(entity)
    const column = (s: BindingSource) =>
      s.strategy === "lookup" ? `_${checkName(s.attribute)}_value` : checkName(s.attribute)
    const select = [...new Set(sources.map(column))].join(",")
    const row = await this.getJson<Record<string, unknown>>(
      `/${entitySet}(${id})?$select=${select}`,
    )
    if (!row) return null
    const values: Record<string, StoreValue> = {}
    for (const source of sources) {
      const value = row[column(source)]
      values[source.attribute] = typeof value === "string" ? value : null
    }
    return { values, etag: String(row["@odata.etag"] ?? "") }
  }

  async write(
    entity: string,
    id: string,
    changes: Change[],
    etag: string,
  ): Promise<void> {
    if (!GUID.test(id)) throw new StoreWriteError("Invalid record id")
    const { entitySet } = await this.entity(entity)
    const body: Record<string, unknown> = {}
    const clears: string[] = []

    for (const { source, value } of changes) {
      if (source.strategy === "attribute") {
        body[checkName(source.attribute)] = value
      } else {
        const nav = await this.navProperty(entity, source)
        if (value === null) {
          clears.push(nav)
        } else {
          if (!GUID.test(value)) throw new StoreWriteError("Invalid option")
          const target = await this.entity(source.target!)
          body[`${nav}@odata.bind`] = `/${target.entitySet}(${value})`
        }
      }
    }

    if (Object.keys(body).length > 0) {
      // If-Match makes the write conditional on the row version read before
      // it; Dataverse answers 412 if anything changed in between.
      const res = await this.request(`/${entitySet}(${id})`, {
        method: "PATCH",
        headers: { "If-Match": etag },
        body: JSON.stringify(body),
      })
      await throwIfWriteFailed(res)
    }
    for (const nav of clears) {
      // Clearing a lookup is a disassociation, not a PATCH to null.
      const res = await this.request(`/${entitySet}(${id})/${nav}/$ref`, {
        method: "DELETE",
      })
      await throwIfWriteFailed(res)
    }
  }

  async lookupOptions(target: string): Promise<BindingOptions> {
    const info = await this.entity(target)
    const res = await this.request(
      `/${info.entitySet}?$select=${info.primaryId},${info.primaryName}&$filter=statecode eq 0&$orderby=${info.primaryName}`,
    )
    if (res.status === 403) {
      // The prototype's account can't read the salutation table in test
      // ICIS; serve the known list for that one, and say so. Anything else
      // unreadable is reported as such rather than guessed at.
      return target === "csg_salutation"
        ? { options: KNOWN_TITLES, source: "fallback" }
        : { options: [], source: "unavailable" }
    }
    if (!res.ok) throw new Error(`ICIS ${res.status}: ${await errorMessage(res)}`)
    const data = (await res.json()) as { value: Array<Record<string, unknown>> }
    return {
      source: "live",
      options: data.value.map((row) => ({
        value: String(row[info.primaryId]),
        label: String(row[info.primaryName] ?? ""),
      })),
    }
  }

  async describe(entity: string, attributes: string[]): Promise<AttributeMetadata[]> {
    if (attributes.length === 0) return []
    const filter = attributes
      .map((a) => `LogicalName eq '${checkName(a)}'`)
      .join(" or ")
    const base = `/EntityDefinitions(LogicalName='${checkName(entity)}')/Attributes`
    const [all, strings, lookups] = await Promise.all([
      this.getJson<{
        value: Array<{
          LogicalName: string
          AttributeType: string
          DisplayName: Label
          RequiredLevel: { Value: string }
          IsValidForUpdate: boolean
        }>
      }>(
        `${base}?$select=LogicalName,AttributeType,DisplayName,RequiredLevel,IsValidForUpdate&$filter=${filter}`,
      ),
      this.getJson<{ value: Array<{ LogicalName: string; MaxLength: number }> }>(
        `${base}/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=LogicalName,MaxLength&$filter=${filter}`,
      ),
      this.getJson<{ value: Array<{ LogicalName: string; Targets: string[] }> }>(
        `${base}/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets&$filter=${filter}`,
      ),
    ])
    const maxLengths = new Map(strings?.value.map((s) => [s.LogicalName, s.MaxLength]))
    const targets = new Map(lookups?.value.map((l) => [l.LogicalName, l.Targets]))

    return (all?.value ?? []).map((a) => {
      const lookupTargets = targets.get(a.LogicalName) ?? []
      const kind =
        a.AttributeType === "String" || a.AttributeType === "Memo"
          ? "text"
          : a.AttributeType === "Lookup" && lookupTargets.length === 1
            ? "lookup"
            : "other"
      return {
        attribute: a.LogicalName,
        displayName: a.DisplayName.UserLocalizedLabel?.Label ?? a.LogicalName,
        kind,
        maxLength: maxLengths.get(a.LogicalName),
        requiredLevel: requiredLevel(a.RequiredLevel?.Value),
        updatable: a.IsValidForUpdate,
        ...(kind === "lookup" ? { lookupTarget: lookupTargets[0] } : {}),
      }
    })
  }

  async permissions(entity: string, targets: string[]): Promise<ServicePermissions> {
    const [held, info, targetInfo] = await Promise.all([
      this.heldPrivileges(),
      this.entity(entity),
      Promise.all(
        targets.map((t) =>
          this.entity(t).then(
            (i) => [t, i] as const,
            () => [t, null] as const,
          ),
        ),
      ),
    ])
    const has = (name: string | undefined) => name !== undefined && held.has(name)
    return {
      readEntity: has(info.privileges.Read),
      writeEntity: has(info.privileges.Write),
      appendEntity: has(info.privileges.Append),
      readTargets: Object.fromEntries(
        targetInfo.map(([t, i]) => [t, i !== null && has(i.privileges.Read)]),
      ),
      appendToTargets: Object.fromEntries(
        targetInfo.map(([t, i]) => [t, i !== null && has(i.privileges.AppendTo)]),
      ),
    }
  }

  // The privileges the DBS's own account holds, via its roles. Cached
  // briefly: a steward granting a privilege should see it take effect
  // without a restart.
  private heldPrivileges(): Promise<Set<string>> {
    if (this.privilegeCache && Date.now() - this.privilegeCache.at < this.privilegeTtlMs) {
      return this.privilegeCache.names
    }
    const names = (async () => {
      const who = await this.getJson<{ UserId: string }>("/WhoAmI")
      if (!who) throw new Error("ICIS WhoAmI failed")
      const result = await this.getJson<{
        RolePrivileges: Array<{ PrivilegeName: string }>
      }>(`/systemusers(${who.UserId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`)
      return new Set(result?.RolePrivileges.map((p) => p.PrivilegeName))
    })()
    names.catch(() => (this.privilegeCache = null))
    this.privilegeCache = { at: Date.now(), names }
    return names
  }
}

function checkName(name: string): string {
  if (!LOGICAL_NAME.test(name)) throw new Error(`Invalid logical name ${name}`)
  return name
}

function requiredLevel(value: string | undefined): AttributeMetadata["requiredLevel"] {
  if (value === "ApplicationRequired" || value === "SystemRequired") return "required"
  if (value === "Recommended") return "recommended"
  return "none"
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
