// Seeds the practitioner portal demo, the way people would set it up by
// hand -- through the same screens and APIs, so every rule still applies:
//
// 1. As the ICIS admin: grants the Data Binding Service's account what the
//    demo needs (the mock ICIS's "Grant what the practitioner portal demo
//    needs" button).
// 2. As a data steward: creates and publishes the client bindings the
//    portal's Client details module uses, through the DBS's binding creator
//    (POST /admin/bindings, then publish). The DBS checks each against the
//    allow-list, ICIS's metadata and its own privileges, exactly as it does
//    for the Data bindings page.
//
// Safe to run again: bindings already published are left alone. Run after
// `npm run demo:portal` has the mock ICIS and the DBS up (it waits for them).

import type { ManagedBinding } from "shared"

const MOCK_ICIS = process.env.MOCK_ICIS_URL ?? "http://localhost:3200"
const DBS = process.env.BINDING_SERVICE_URL ?? "http://localhost:3100"

const BINDINGS = [
  {
    key: "client.preferredName",
    label: "Preferred name",
    description: "What the client likes to be called.",
    attribute: "csg_alias",
    access: "readWrite",
    maxLength: 60,
  },
  {
    key: "client.gender",
    label: "Gender",
    description: "The client's gender, from ICIS's gender list.",
    attribute: "csg_genderid",
    access: "readWrite",
    presentations: ["dropdown", "radio"],
  },
  {
    key: "client.mobilePhone",
    label: "Mobile phone",
    description: "The client's mobile number.",
    attribute: "mobilephone",
    access: "readWrite",
  },
  {
    key: "client.email",
    label: "Email",
    description: "The client's email address.",
    attribute: "emailaddress1",
    access: "readWrite",
  },
] as const

async function waitFor(url: string, name: string) {
  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      const res = await fetch(url, { redirect: "manual" })
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`${name} isn't answering at ${url}. Is the demo running?`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function dbs<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DBS}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const body = (await res.json().catch(() => null)) as { message?: string } | null
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status} ${body?.message ?? ""}`)
  return body as T
}

async function main() {
  await Promise.all([waitFor(`${MOCK_ICIS}/clients`, "The mock ICIS"), waitFor(`${DBS}/health`, "The Data Binding Service")])

  const grant = await fetch(`${MOCK_ICIS}/service-account/grant-portal-demo`, { method: "POST", redirect: "manual" })
  if (grant.status >= 400) throw new Error(`Couldn't grant privileges in the mock ICIS (${grant.status})`)
  console.log("ICIS admin: granted the Data Binding Service's account what the portal demo needs")

  const existing = await dbs<ManagedBinding[]>("/admin/bindings")
  for (const binding of BINDINGS) {
    const managed = existing.find((b) => b.key === binding.key)
    if (managed?.versions.some((v) => v.status === "published")) {
      console.log(`Data steward: ${binding.key} is already published`)
      continue
    }
    if (!managed?.versions.some((v) => v.status === "draft")) {
      await dbs("/admin/bindings", { method: "POST", body: JSON.stringify(binding) })
    }
    await dbs(`/admin/bindings/${encodeURIComponent(binding.key)}/publish`, { method: "POST", body: "{}" })
    console.log(`Data steward: created and published ${binding.key} (ICIS ${binding.attribute})`)
  }
  console.log(`\nSeeded. Open the portal at http://localhost:5180`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
