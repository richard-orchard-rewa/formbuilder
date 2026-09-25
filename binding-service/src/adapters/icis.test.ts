import { describe, expect, it } from "vitest"
import { ConcurrentUpdateError, StoreWriteError } from "./adapter.js"
import { KNOWN_TITLES } from "./fake.js"
import { IcisClientStore } from "./icis.js"

const ORG = "https://org.crm6.dynamics.com"
const ID = "2c616f0e-d741-f011-8779-000d3ad0ea14"
const TITLE = "8c8b6ce9-e68f-df11-aff9-0050569f692b"

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

// A stub Dataverse: records every request and answers with the next queued
// response.
function stub(...responses: Response[]) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    })
    return responses.shift() ?? new Response(null, { status: 204 })
  }) as typeof fetch
  const store = new IcisClientStore(ORG, async () => "token", fetchImpl)
  return { store, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

describe("IcisClientStore", () => {
  it("maps a contact to the DBS's client record, with its etag", async () => {
    const { store, calls } = stub(
      json({
        "@odata.etag": 'W/"42"',
        contactid: ID,
        csg_clientid: "00152076",
        firstname: "Bob",
        lastname: "McGee",
        _csg_salutationid_value: TITLE,
      }),
    )
    expect(await store.get(ID)).toEqual({
      etag: 'W/"42"',
      record: {
        clientNumber: "00152076",
        titleId: TITLE,
        firstName: "Bob",
        lastName: "McGee",
      },
    })
    expect(calls[0].url).toBe(
      `${ORG}/api/data/v9.2/contacts(${ID})?$select=csg_clientid,firstname,lastname,_csg_salutationid_value`,
    )
    expect(calls[0].headers.Authorization).toBe("Bearer token")
  })

  it("writes names and the title lookup in one conditional PATCH", async () => {
    const { store, calls } = stub()
    await store.update(ID, { firstName: "Bobby", titleId: TITLE }, 'W/"42"')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      url: `${ORG}/api/data/v9.2/contacts(${ID})`,
      body: {
        firstname: "Bobby",
        "csg_salutationid@odata.bind": `/csg_salutations(${TITLE})`,
      },
    })
    expect(calls[0].headers["If-Match"]).toBe('W/"42"')
  })

  it("clears the title by disassociating the lookup", async () => {
    const { store, calls } = stub()
    await store.update(ID, { titleId: null }, 'W/"42"')
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["DELETE", `${ORG}/api/data/v9.2/contacts(${ID})/csg_salutationid/$ref`],
    ])
  })

  it("turns a 412 into a concurrent-update error", async () => {
    const { store } = stub(new Response(null, { status: 412 }))
    await expect(store.update(ID, { firstName: "X" }, "e")).rejects.toThrow(
      ConcurrentUpdateError,
    )
  })

  it("reports a missing privilege without leaking Dataverse's principal details", async () => {
    const { store } = stub(
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
      .update(ID, { firstName: "X" }, "e")
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StoreWriteError)
    expect((error as Error).message).toContain("prvWriteContact")
    expect((error as Error).message).not.toContain("AADObjectId")
  })

  it("only looks up well-formed, unambiguous client numbers", async () => {
    const { store, calls } = stub(
      json({ value: [{ contactid: ID, csg_clientid: "1" }, { contactid: ID }] }),
    )
    expect(await store.findByClientNumber("1' or 1 eq 1")).toBeNull()
    expect(calls).toHaveLength(0)
    expect(await store.findByClientNumber("1")).toBeNull()
  })

  it("falls back to the known titles when it can't read the salutation table", async () => {
    const { store } = stub(json({ error: { message: "no read" } }, 403))
    expect(await store.listTitles()).toEqual({
      options: KNOWN_TITLES,
      source: "fallback",
    })
  })
})
