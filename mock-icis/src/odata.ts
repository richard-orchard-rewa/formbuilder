import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  ENTITIES,
  LOOKUP_ROWS,
  RECORD_ENTITIES,
  SERVICE_ACCOUNT,
  type AttributeDef,
  type EntityDef,
  type Value,
} from "./data.js"
import { touch, type MockIcisState } from "./state.js"

// A stand-in for the Dataverse Web API (v9.2) that speaks exactly the subset
// the Data Binding Service's ICIS adapter uses -- metadata, record reads
// (with a single-level $expand) and PATCHes, filtered lists, lookup lists,
// WhoAmI and RetrieveUserPrivileges -- with Dataverse's own URL shapes,
// etags and error bodies. Anything outside that subset answers 400 saying
// so, rather than pretending.

const PREFIX = "/api/data/v9.2/"
const GUID = "[0-9a-fA-F-]{36}"

class ODataError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "0x80040216",
  ) {
    super(message)
  }
}

function unsupported(what: string): never {
  throw new ODataError(400, `The mock ICIS doesn't support ${what}.`)
}

function entityByName(logicalName: string) {
  const entity = ENTITIES.find((e) => e.logicalName === logicalName)
  if (!entity) {
    throw new ODataError(404, `Could not find entity with LogicalName = '${logicalName}'`)
  }
  return entity
}

function entityBySet(entitySet: string) {
  const entity = ENTITIES.find((e) => e.entitySet === entitySet)
  if (!entity) {
    throw new ODataError(404, `Resource not found for the segment '${entitySet}'.`)
  }
  return entity
}

const isRecordEntity = (entity: EntityDef) => RECORD_ENTITIES.includes(entity)

const navigationOf = (a: AttributeDef) => a.navigation ?? a.logicalName

// Only `field eq 'value'` / `field eq <guid>` / `field eq 0` clauses joined
// by a single kind of `or`/`and` -- all the adapter ever sends.
function parseFilter(filter: string | undefined) {
  if (!filter) return { join: "and" as const, clauses: [] }
  const join = / or /.test(filter) ? ("or" as const) : ("and" as const)
  const clauses = filter.split(join === "or" ? / or / : / and /).map((clause) => {
    const match = new RegExp(`^\\s*(\\w+) eq (?:'([^']*)'|(${GUID})|(\\d+))\\s*$`).exec(clause)
    if (!match) unsupported(`the filter "${clause}"`)
    return { field: match[1], value: match[2] ?? match[3] ?? match[4] }
  })
  return { join, clauses }
}

function selectList(select: string | undefined) {
  return select ? select.split(",").map((s) => s.trim()) : []
}

// `nav($select=a,b)` -- one single-valued navigation property, one level.
function parseExpand(expand: string | undefined) {
  if (!expand) return null
  const match = /^(\w+)\(\$select=([\w,]+)\)$/.exec(expand.trim())
  if (!match) unsupported(`the expand "${expand}"`)
  return { navigation: match[1], select: selectList(match[2]) }
}

export function registerOData(app: FastifyInstance, state: MockIcisState) {
  const denied = (entity: EntityDef, type: "Read" | "Write" | "Append" | "AppendTo") => {
    const privilege = entity.privileges[type]!
    return new ODataError(
      403,
      `Principal user (Id=${SERVICE_ACCOUNT.userId}, type=8, roleCount=1, privilegeCount=${state.privileges.size}, accessMode='4 Non-interactive', AADObjectId=00000000-0000-0000-0000-000000000000, MetadataCachePrivilegesCount=0, businessUnitId=00000000-0000-0000-0000-000000000000), is missing ${privilege} privilege on OTC for entity '${entity.logicalName}' (LocalizedName='${entity.displayName}'). Consider adding missed privilege to one of the principal (user/team) roles.`,
      "0x80040220",
    )
  }
  const demand = (entity: EntityDef, type: "Read" | "Write" | "Append" | "AppendTo") => {
    if (!state.privileges.has(entity.privileges[type]!)) throw denied(entity, type)
  }

  function metadataAttribute(a: AttributeDef) {
    return {
      LogicalName: a.logicalName,
      AttributeType: a.type,
      DisplayName: { UserLocalizedLabel: { Label: a.displayName } },
      RequiredLevel: { Value: a.requiredLevel },
      IsValidForUpdate: a.validForUpdate,
    }
  }

  function notFound(entity: EntityDef, id: string) {
    return new ODataError(404, `Entity '${entity.logicalName}' With Id = ${id} Does Not Exist`)
  }

  function noProperty(entity: EntityDef, column: string) {
    return new ODataError(
      400,
      `Could not find a property named '${column}' on type 'Microsoft.Dynamics.CRM.${entity.logicalName}'.`,
      "0x80060888",
    )
  }

  function recordJson(
    entity: EntityDef,
    id: string,
    select: string[],
    expand: ReturnType<typeof parseExpand> = null,
  ) {
    const record = state.table(entity.logicalName).get(id)
    if (!record) throw notFound(entity, id)
    const row: Record<string, unknown> = {
      "@odata.etag": `W/"${record.version}"`,
      [entity.primaryId]: record.id,
    }
    for (const column of select) {
      if (column === entity.primaryId) continue
      const lookup = /^_(\w+)_value$/.exec(column)
      const attribute = lookup ? lookup[1] : column
      const def = entity.attributes.find((a) => a.logicalName === attribute)
      if (!def || (lookup ? def.type !== "Lookup" : def.type === "Lookup")) {
        throw noProperty(entity, column)
      }
      row[column] = record.values[attribute] ?? null
    }
    if (expand) {
      const def = entity.attributes.find(
        (a) => a.type === "Lookup" && navigationOf(a) === expand.navigation,
      )
      if (!def) throw noProperty(entity, expand.navigation)
      const target = entityByName(def.target!)
      if (!isRecordEntity(target)) unsupported(`expanding ${expand.navigation}`)
      demand(target, "Read")
      const refId = record.values[def.logicalName]
      row[expand.navigation] =
        typeof refId === "string" && state.table(target.logicalName).has(refId)
          ? recordJson(target, refId, expand.select)
          : null
    }
    return row
  }

  function handle(request: FastifyRequest, path: string) {
    const query = request.query as Record<string, string | undefined>
    const method = request.method

    if (path === "WhoAmI" && method === "GET") {
      return {
        UserId: SERVICE_ACCOUNT.userId,
        BusinessUnitId: "00000000-0000-0000-0000-000000000000",
        OrganizationId: "00000000-0000-0000-0000-000000000000",
      }
    }

    let m = new RegExp(`^systemusers\\((${GUID})\\)/Microsoft\\.Dynamics\\.CRM\\.RetrieveUserPrivileges\\(\\)$`).exec(path)
    if (m && method === "GET") {
      demand(entityByName("systemuser"), "Read")
      if (m[1] !== SERVICE_ACCOUNT.userId) {
        throw new ODataError(404, `systemuser With Id = ${m[1]} Does Not Exist`)
      }
      return {
        RolePrivileges: [...state.privileges].map((name, i) => ({
          Depth: "Global",
          PrivilegeId: `de30a000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          BusinessUnitId: "00000000-0000-0000-0000-000000000000",
          PrivilegeName: name,
          RecordFilterId: "00000000-0000-0000-0000-000000000000",
          RecordFilterUniqueName: "",
        })),
      }
    }

    m = /^EntityDefinitions\(LogicalName='(\w+)'\)(?:\/(.*))?$/.exec(path)
    if (m && method === "GET") {
      const entity = entityByName(m[1])
      const rest = m[2]
      if (!rest) {
        return {
          LogicalName: entity.logicalName,
          EntitySetName: entity.entitySet,
          PrimaryIdAttribute: entity.primaryId,
          PrimaryNameAttribute: entity.primaryName,
          Privileges: Object.entries(entity.privileges).map(([type, name]) => ({
            Name: name,
            PrivilegeType: type,
          })),
        }
      }
      // A choice column's option set: metadata, so no record privilege needed.
      const picklist = /^Attributes\(LogicalName='(\w+)'\)\/Microsoft\.Dynamics\.CRM\.PicklistAttributeMetadata$/.exec(rest)
      if (picklist) {
        const def = entity.attributes.find((a) => a.logicalName === picklist[1])
        if (!def || def.type !== "Picklist") {
          throw new ODataError(404, `No picklist attribute ${picklist[1]} on ${entity.logicalName}`)
        }
        return {
          LogicalName: def.logicalName,
          OptionSet: {
            Options: def.options!.map((o) => ({
              Value: o.value,
              Label: { UserLocalizedLabel: { Label: o.label } },
            })),
          },
        }
      }
      const { clauses } = parseFilter(query.$filter)
      if (rest === "ManyToOneRelationships") {
        const attribute = clauses.find((c) => c.field === "ReferencingAttribute")?.value
        const def = entity.attributes.find(
          (a) => a.logicalName === attribute && a.type === "Lookup",
        )
        return {
          value: def
            ? [
                {
                  ReferencingAttribute: def.logicalName,
                  ReferencedEntity: def.target,
                  ReferencingEntityNavigationPropertyName: navigationOf(def),
                },
              ]
            : [],
        }
      }
      const names = clauses.filter((c) => c.field === "LogicalName").map((c) => c.value)
      const matching = entity.attributes.filter(
        (a) => names.length === 0 || names.includes(a.logicalName),
      )
      if (rest === "Attributes") {
        return { value: matching.map(metadataAttribute) }
      }
      if (rest === "Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata") {
        return {
          value: matching
            .filter((a) => a.type === "String")
            .map((a) => ({ LogicalName: a.logicalName, MaxLength: a.maxLength })),
        }
      }
      if (rest === "Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata") {
        return {
          value: matching
            .filter((a) => a.type === "Lookup")
            .map((a) => ({ LogicalName: a.logicalName, Targets: [a.target] })),
        }
      }
      unsupported(`the metadata path ${rest}`)
    }

    m = new RegExp(`^(\\w+)\\((${GUID})\\)/(\\w+)/\\$ref$`).exec(path)
    if (m && method === "DELETE") {
      const entity = entityBySet(m[1])
      if (!isRecordEntity(entity)) unsupported(`writing ${entity.entitySet}`)
      const def = entity.attributes.find((a) => navigationOf(a) === m![3] && a.type === "Lookup")
      if (!def) unsupported(`the navigation property ${m[3]}`)
      demand(entity, "Write")
      demand(entity, "Append")
      const record = state.table(entity.logicalName).get(m[2])
      if (!record) throw notFound(entity, m[2])
      record.values[def.logicalName] = null
      touch(record, SERVICE_ACCOUNT.name)
      return null
    }

    m = new RegExp(`^(\\w+)\\((${GUID})\\)$`).exec(path)
    if (m) {
      const entity = entityBySet(m[1])
      if (!isRecordEntity(entity)) unsupported(`single-record access to ${entity.entitySet}`)
      if (method === "GET") {
        demand(entity, "Read")
        return recordJson(entity, m[2], selectList(query.$select), parseExpand(query.$expand))
      }
      if (method === "PATCH") {
        return patchRecord(request, entity, m[2])
      }
    }

    m = /^(\w+)$/.exec(path)
    if (m && method === "GET") {
      const entity = entityBySet(m[1])
      demand(entity, "Read")
      const { join, clauses } = parseFilter(query.$filter)
      if (isRecordEntity(entity)) {
        // $orderby is accepted and ignored: callers sort for themselves.
        if (clauses.length === 0) unsupported(`listing ${entity.entitySet} without a filter`)
        const matches = (values: Record<string, Value>) => {
          const results = clauses.map((c) => {
            const lookup = /^_(\w+)_value$/.exec(c.field)
            const attribute = lookup ? lookup[1] : c.field
            const def = entity.attributes.find((a) => a.logicalName === attribute)
            if (!def) throw noProperty(entity, c.field)
            return String(values[attribute] ?? "").toLowerCase() === String(c.value).toLowerCase()
          })
          return join === "or" ? results.some(Boolean) : results.every(Boolean)
        }
        const top = Number(query.$top ?? 5000)
        const select = selectList(query.$select)
        const expand = parseExpand(query.$expand)
        return {
          value: [...state.table(entity.logicalName).values()]
            .filter((r) => matches(r.values))
            .slice(0, top)
            .map((r) => recordJson(entity, r.id, select, expand)),
        }
      }
      const rows = LOOKUP_ROWS[entity.logicalName]
      if (!rows) unsupported(`listing ${entity.entitySet}`)
      return {
        value: [...rows]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((row) => ({
            "@odata.etag": 'W/"1"',
            [entity.primaryId]: row.id,
            [entity.primaryName]: row.name,
            statecode: 0,
          })),
      }
    }

    unsupported(`${method} ${path}`)
  }

  // Does `id` name a row of `target` -- a reference list's, or a record's?
  function rowExists(target: EntityDef, id: string) {
    return isRecordEntity(target)
      ? state.table(target.logicalName).has(id)
      : Boolean(LOOKUP_ROWS[target.logicalName]?.some((r) => r.id === id))
  }

  function patchRecord(request: FastifyRequest, entity: EntityDef, id: string) {
    demand(entity, "Write")
    const record = state.table(entity.logicalName).get(id)
    if (!record) throw notFound(entity, id)
    const ifMatch = request.headers["if-match"]
    if (ifMatch && ifMatch !== "*" && ifMatch !== `W/"${record.version}"`) {
      throw new ODataError(412, "The version of the existing record doesn't match the RowVersion property provided.", "0x80060882")
    }

    const body = (request.body ?? {}) as Record<string, unknown>
    const changes: Record<string, Value> = {}
    for (const [key, value] of Object.entries(body)) {
      const bind = /^(\w+)@odata\.bind$/.exec(key)
      if (bind) {
        const def = entity.attributes.find((a) => navigationOf(a) === bind[1] && a.type === "Lookup")
        if (!def) throw new ODataError(400, `An undeclared property '${bind[1]}' which only has property annotations in the payload but no property value was found in the payload.`)
        const target = entityByName(def.target!)
        demand(entity, "Append")
        demand(target, "AppendTo")
        const ref = new RegExp(`^/${target.entitySet}\\((${GUID})\\)$`).exec(String(value))
        if (!ref || !rowExists(target, ref[1])) {
          throw new ODataError(404, `Entity '${target.logicalName}' With Id = ${ref?.[1] ?? value} Does Not Exist`)
        }
        changes[def.logicalName] = ref[1]
        continue
      }
      const def = entity.attributes.find((a) => a.logicalName === key)
      if (!def || def.type === "Lookup") {
        throw new ODataError(400, `The property '${key}' does not exist on type 'Microsoft.Dynamics.CRM.${entity.logicalName}'.`, "0x80060888")
      }
      if (def.type === "Picklist") {
        if (value !== null && !(typeof value === "number" && def.options!.some((o) => o.value === value))) {
          throw new ODataError(
            400,
            `A validation error occurred. The value ${String(value)} of '${key}' on record of type '${entity.logicalName}' is outside the valid range.`,
            "0x8004431A",
          )
        }
        changes[key] = value as number | null
        continue
      }
      if (def.type !== "String") unsupported(`writing ${def.type} attributes`)
      if (value !== null && typeof value !== "string") {
        throw new ODataError(400, `Cannot convert the literal to the expected type for '${key}'.`)
      }
      if (typeof value === "string" && def.maxLength && value.length > def.maxLength) {
        throw new ODataError(
          400,
          `A validation error occurred. The length of the '${key}' attribute of the '${entity.logicalName}' entity exceeded the maximum allowed length of '${def.maxLength}'.`,
          "0x80044331",
        )
      }
      changes[key] = value
    }
    record.values = { ...record.values, ...changes }
    touch(record, SERVICE_ACCOUNT.name)
    return null
  }

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const path = decodeURIComponent((request.params as { "*": string })["*"])
    let status = 200
    let payload: unknown
    try {
      const auth = request.headers.authorization
      if (auth !== `Bearer ${SERVICE_ACCOUNT.token}`) {
        throw new ODataError(401, "Unauthorized: the mock ICIS accepts only the demo service account's token.")
      }
      const result = handle(request, path)
      if (result === null) status = 204
      else payload = result
    } catch (error) {
      if (!(error instanceof ODataError)) throw error
      status = error.status
      payload = { error: { code: error.code, message: error.message } }
    }
    const url = request.url.slice(PREFIX.length)
    state.record({
      at: new Date().toISOString(),
      method: request.method,
      path: decodeURIComponent(url),
      status,
    })
    reply.header("OData-Version", "4.0")
    return status === 204 ? reply.code(204).send() : reply.code(status).send(payload)
  }

  app.route({
    method: ["GET", "PATCH", "DELETE", "POST"],
    url: `${PREFIX}*`,
    handler,
  })
}
