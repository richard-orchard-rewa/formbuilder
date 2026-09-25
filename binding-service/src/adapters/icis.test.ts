import { describe, expect, it } from "vitest"
import { ConcurrentUpdateError, StoreWriteError, type BindingSource } from "./adapter.js"
import { KNOWN_TITLES } from "./fake.js"
import { IcisRecordStore } from "./icis.js"

const ORG = "https://org.crm6.dynamics.com"
const API = `${ORG}/api/data/v9.2`
const ID = "2c616f0e-d741-f011-8779-000d3ad0ea14"
const TITLE = "8c8b6ce9-e68f-df11-aff9-0050569f692b"

const firstName: BindingSource = { strategy: "attribute", entity: "contact", attribute: "firstname" }
const title: BindingSource = {
  strategy: "lookup",
  entity: "contact",
  attribute: "csg_salutationid",
  target: "csg_salutation",
}

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const ENTITY_META: Record<string, unknown> = {
  contact: {
    EntitySetName: "contacts",
    PrimaryIdAttribute: "contactid",
    PrimaryNameAttribute: "fullname",
    Privileges: [
      { Name: "prvReadContact", PrivilegeType: "Read" },
      { Name: "prvWriteContact", PrivilegeType: "Write" },
    ],
  },
  csg_salutation: {
    EntitySetName: "csg_salutations",
    PrimaryIdAttribute: "csg_salutationid",
    PrimaryNameAttribute: "csg_name",
    Privileges: [{ Name: "prvReadCsg_salutation", PrivilegeType: "Read" }],
  },
}

// A stub Dataverse that answers metadata requests itself and hands
// everything else to `handle`, recording every call.
function stub(handle: (call: Call) => Response | undefined = () => undefined) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    }
    calls.push(call)
    const entity = /EntityDefinitions\(LogicalName='(\w+)'\)\?\$select/.exec(url)?.[1]
    if (entity) return json(ENTITY_META[entity])
    if (url.includes("ManyToOneRelationships")) {
      return json({ value: [{ ReferencingEntityNavigationPropertyName: "csg_salutationid" }] })
    }
    return handle(call) ?? new Response(null, { status: 204 })
  }) as typeof fetch
  const store = new IcisRecordStore(ORG, async () => "token", fetchImpl)
  const data = () => calls.filter((c) => !c.url.includes("EntityDefinitions"))
  return { store, calls, data }
}

describe("IcisRecordStore", () => {
  it("reads attributes and lookups (as _x_value) with the row's etag", async () => {
    const { store, data } = stub(() =>
      json({ "@odata.etag": 'W/"42"', firstname: "Bob", _csg_salutationid_value: TITLE }),
    )
    expect(await store.read("contact", ID, [firstName, title])).toEqual({
      etag: 'W/"42"',
      values: { firstname: "Bob", csg_salutationid: TITLE },
    })
    expect(data()[0].url).toBe(
      `${API}/contacts(${ID})?$select=firstname,_csg_salutationid_value`,
    )
    expect(data()[0].headers.Authorization).toBe("Bearer token")
  })

  it("writes attributes and lookup binds in one conditional PATCH", async () => {
    const { store, data } = stub()
    await store.write(
      "contact",
      ID,
      [
        { source: firstName, value: "Bobby" },
        { source: title, value: TITLE },
      ],
      'W/"42"',
    )
    expect(data()).toHaveLength(1)
    expect(data()[0]).toMatchObject({
      method: "PATCH",
      url: `${API}/contacts(${ID})`,
      body: {
        firstname: "Bobby",
        "csg_salutationid@odata.bind": `/csg_salutations(${TITLE})`,
      },
    })
    expect(data()[0].headers["If-Match"]).toBe('W/"42"')
  })

  it("clears a lookup by disassociating it", async () => {
    const { store, data } = stub()
    await store.write("contact", ID, [{ source: title, value: null }], "e")
    expect(data().map((c) => [c.method, c.url])).toEqual([
      ["DELETE", `${API}/contacts(${ID})/csg_salutationid/$ref`],
    ])
  })

  it("turns a 412 into a concurrent-update error", async () => {
    const { store } = stub(() => new Response(null, { status: 412 }))
    await expect(
      store.write("contact", ID, [{ source: firstName, value: "X" }], "e"),
    ).rejects.toThrow(ConcurrentUpdateError)
  })

  it("reports a missing privilege without leaking Dataverse's principal details", async () => {
    const { store } = stub(() =>
      json(
        {
          error: {
            message:
              "Principal user (Id=abc, AADObjectId=def) is missing prvWriteContact privilege (Id=123)",
          },
        },
        403,
      ),
    )
    const error = await store
      .write("contact", ID, [{ source: firstName, value: "X" }], "e")
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StoreWriteError)
    expect((error as Error).message).toContain("prvWriteContact")
    expect((error as Error).message).not.toContain("AADObjectId")
  })

  it("refuses logical names that aren't plain identifiers", async () => {
    const { store } = stub()
    await expect(
      store.read("contact", ID, [{ ...firstName, attribute: "firstname,adx_identity_passwordhash" }]),
    ).rejects.toThrow("Invalid logical name")
  })

  it("only looks up well-formed, unambiguous client numbers", async () => {
    const { store, data } = stub(() =>
      json({ value: [{ contactid: ID, csg_clientid: "1" }, { contactid: ID }] }),
    )
    expect(await store.findClientByNumber("1' or 1 eq 1")).toBeNull()
    expect(data()).toHaveLength(0)
    expect(await store.findClientByNumber("1")).toBeNull()
  })

  it("falls back to the known titles when it can't read the salutation table", async () => {
    const { store } = stub(() => json({ error: { message: "no read" } }, 403))
    expect(await store.lookupOptions("csg_salutation")).toEqual({
      options: KNOWN_TITLES,
      source: "fallback",
    })
  })

  it("describes attributes from the store's metadata", async () => {
    const { store } = stub((call) => {
      if (call.url.includes("StringAttributeMetadata")) {
        return json({ value: [{ LogicalName: "csg_alias", MaxLength: 100 }] })
      }
      if (call.url.includes("LookupAttributeMetadata")) {
        return json({ value: [{ LogicalName: "csg_genderid", Targets: ["csg_gender"] }] })
      }
      return json({
        value: [
          {
            LogicalName: "csg_alias",
            AttributeType: "String",
            DisplayName: { UserLocalizedLabel: { Label: "Preferred Name" } },
            RequiredLevel: { Value: "None" },
            IsValidForUpdate: true,
          },
          {
            LogicalName: "csg_genderid",
            AttributeType: "Lookup",
            DisplayName: { UserLocalizedLabel: { Label: "Gender" } },
            RequiredLevel: { Value: "ApplicationRequired" },
            IsValidForUpdate: true,
          },
        ],
      })
    })
    expect(await store.describe("contact", ["csg_alias", "csg_genderid"])).toEqual([
      {
        attribute: "csg_alias",
        displayName: "Preferred Name",
        kind: "text",
        maxLength: 100,
        requiredLevel: "none",
        updatable: true,
      },
      {
        attribute: "csg_genderid",
        displayName: "Gender",
        kind: "lookup",
        maxLength: undefined,
        requiredLevel: "required",
        updatable: true,
        lookupTarget: "csg_gender",
      },
    ])
  })

  it("works out what its own account may do from its role privileges", async () => {
    const { store } = stub((call) => {
      if (call.url.endsWith("/WhoAmI")) return json({ UserId: ID })
      if (call.url.includes("RetrieveUserPrivileges")) {
        return json({ RolePrivileges: [{ PrivilegeName: "prvReadContact" }] })
      }
      return undefined
    })
    expect(await store.permissions("contact", ["csg_salutation"])).toEqual({
      readEntity: true,
      writeEntity: false,
      appendEntity: false,
      readTargets: { csg_salutation: false },
      appendToTargets: { csg_salutation: false },
    })
  })
})
