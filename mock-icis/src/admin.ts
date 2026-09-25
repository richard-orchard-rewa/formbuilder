import type { FastifyInstance } from "fastify"
import {
  CONTACT,
  LOOKUP_ROWS,
  LOOKUP_TABLES,
  SERVICE_ACCOUNT,
  SYSTEMUSER,
  type ContactRow,
} from "./data.js"
import type { MockIcisState } from "./state.js"

// The mock's own screens, for demonstrating the ICIS side of data binding:
// browse and edit client records as ICIS staff would, grant or revoke the
// Data Binding Service account's privileges, and watch every API call the
// service makes. Plain server-rendered HTML -- it's a prop, not a product.

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const STYLE = `
  :root { color-scheme: light; --blue:#1f4e8c; --ink:#1b1b1b; --muted:#616161; --line:#e0e0e0; --bg:#f5f5f5; --warn:#8a5a00; --warnbg:#fff4ce; --ok:#0e700e; }
  * { box-sizing: border-box; }
  body { margin:0; font: 14px/1.45 "Segoe UI", system-ui, sans-serif; color: var(--ink); background: var(--bg); }
  header { background: var(--blue); color:#fff; padding: 10px 20px; display:flex; align-items:center; gap: 24px; flex-wrap: wrap; }
  header strong { font-size: 16px; }
  header .tag { background:#fff3; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
  header nav a { color:#fff; text-decoration:none; margin-right:16px; opacity:.85; }
  header nav a.active { opacity:1; border-bottom: 2px solid #fff; }
  header form { margin-left:auto; }
  main { max-width: 1100px; margin: 20px auto; padding: 0 16px; }
  .card { background:#fff; border:1px solid var(--line); border-radius: 6px; padding: 16px 20px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  p.lead { color: var(--muted); margin-top: 0; }
  table { width:100%; border-collapse: collapse; }
  th, td { text-align:left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; }
  a { color: var(--blue); }
  code { font: 12px Consolas, monospace; color: var(--muted); }
  input[type=text], select { width: 100%; padding: 5px 7px; border: 1px solid #bdbdbd; border-radius: 4px; font: inherit; }
  button { font: inherit; padding: 6px 14px; border-radius: 4px; border: 1px solid var(--blue); background: var(--blue); color:#fff; cursor: pointer; }
  button.secondary { background:#fff; color: var(--blue); }
  .sensitive { background: var(--warnbg); color: var(--warn); border-radius: 3px; padding: 1px 6px; font-size: 11px; white-space: nowrap; }
  .notice { background: #dff6dd; color: var(--ok); padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; }
  .status-2 { color: var(--ok); } .status-4 { color: #b10e1c; } .status-2, .status-4 { font-weight: 600; }
  .grid { display:grid; grid-template-columns: 220px 1fr; gap: 6px 16px; align-items: center; }
  .priv label { display:flex; gap:8px; align-items:flex-start; margin: 4px 0; }
  .priv small { color: var(--muted); display:block; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } header form { margin-left:0; } }
`

function layout(title: string, active: string, body: string, refreshSeconds?: number) {
  const link = (href: string, label: string) =>
    `<a href="${href}" class="${active === href ? "active" : ""}">${label}</a>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : ""}
<title>${esc(title)} · Mock ICIS</title><style>${STYLE}</style></head><body>
<header><strong>ICIS</strong><span class="tag">MOCK — demo data only</span>
<nav>${link("/clients", "Clients")}${link("/service-account", "Service account")}${link("/api-log", "API log")}</nav>
<form method="post" action="/reset" onsubmit="return confirm('Reset all clients, privileges and the API log to the demo seed?')"><button class="secondary" type="submit">Reset demo</button></form>
</header><main>${body}</main></body></html>`
}

function lookupLabel(state: MockIcisState, table: string | undefined, id: string | null) {
  return table ? (state.lookupName(table, id) ?? "") : ""
}

function clientName(c: ContactRow) {
  return [c.values.firstname, c.values.lastname].filter(Boolean).join(" ")
}

// Privileges the demo lets you grant, with what each means for bindings.
const PRIVILEGE_GROUPS = [
  {
    table: CONTACT,
    rows: [
      { type: "Read", note: "Resolve client values; find clients by number. Without it, nothing works." },
      { type: "Write", note: "Save edited values back. Without it, every binding is display-only." },
      { type: "Append", note: "Set a client's lookups (title, gender, …) when saving." },
    ],
  },
  ...LOOKUP_TABLES.map((table) => ({
    table,
    rows: [
      { type: "Read", note: `Show the ${table.displayName.toLowerCase()} list as options. Without it, a lookup binding can't be published.` },
      { type: "AppendTo", note: `Let a client be linked to a ${table.displayName.toLowerCase()} when saving.` },
    ],
  })),
  {
    table: SYSTEMUSER,
    rows: [{ type: "Read", note: "Lets the service check its own privileges (RetrieveUserPrivileges)." }],
  },
] as const

export function registerAdmin(app: FastifyInstance, state: MockIcisState) {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      const params = new URLSearchParams(body as string)
      const result: Record<string, string | string[]> = {}
      for (const key of new Set(params.keys())) {
        const all = params.getAll(key)
        result[key] = all.length > 1 ? all : all[0]
      }
      done(null, result)
    },
  )

  app.get("/", async (_request, reply) => reply.redirect("/clients"))

  app.get("/clients", async (request, reply) => {
    const q = String((request.query as { q?: string }).q ?? "").trim().toLowerCase()
    const rows = [...state.contacts.values()]
      .filter(
        (c) =>
          !q ||
          clientName(c).toLowerCase().includes(q) ||
          String(c.values.csg_clientid).includes(q),
      )
      .sort((a, b) => String(a.values.csg_clientid).localeCompare(String(b.values.csg_clientid)))
    const body = `
<div class="card"><h1>Clients</h1>
<p class="lead">Made-up client records shaped like ICIS's <code>contact</code> table. Open one to see every column — including the sensitive ones the Data Binding Service's allow-list keeps away from forms — or to edit it as ICIS staff would.</p>
<form method="get"><input type="text" name="q" value="${esc(q)}" placeholder="Search by name or client number" aria-label="Search clients"></form></div>
<div class="card"><table><thead><tr><th>Client number</th><th>Title</th><th>Name</th><th>Preferred name</th><th>Gender</th><th>Home language</th><th>Last modified</th></tr></thead><tbody>
${rows
  .map(
    (c) => `<tr><td><a href="/clients/${c.contactid}">${esc(c.values.csg_clientid)}</a></td>
<td>${esc(lookupLabel(state, "csg_salutation", c.values.csg_salutationid))}</td>
<td>${esc(clientName(c))}</td><td>${esc(c.values.csg_alias)}</td>
<td>${esc(lookupLabel(state, "csg_gender", c.values.csg_genderid))}</td>
<td>${esc(lookupLabel(state, "csg_language", c.values.csg_home_languageid))}</td>
<td>${esc(new Date(c.modifiedOn).toLocaleString("en-AU", { timeZone: "Australia/Perth" }))}<br><code>${esc(c.modifiedBy)}</code></td></tr>`,
  )
  .join("")}
</tbody></table></div>`
    return reply.type("text/html").send(layout("Clients", "/clients", body))
  })

  app.get("/clients/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const saved = (request.query as { saved?: string }).saved
    const c = state.contacts.get(id)
    if (!c) return reply.code(404).type("text/html").send(layout("Not found", "/clients", `<div class="card">No such client.</div>`))
    const fields = CONTACT.attributes
      .map((a) => {
        const value = c.values[a.logicalName] ?? ""
        const input =
          a.type === "Lookup"
            ? `<select name="${a.logicalName}"><option value="">—</option>${LOOKUP_ROWS[a.target!]
                .map((row) => `<option value="${row.id}" ${row.id === value ? "selected" : ""}>${esc(row.name)}</option>`)
                .join("")}</select>`
            : `<input type="text" name="${a.logicalName}" value="${esc(value)}"${a.maxLength ? ` maxlength="${a.maxLength}"` : ""}>`
        return `<label for="${a.logicalName}">${esc(a.displayName)}<br><code>${a.logicalName}</code>${a.sensitive ? ` <span class="sensitive">${esc(a.sensitive)}</span>` : ""}</label><div>${input.replace("name=", `id="${a.logicalName}" name=`)}</div>`
      })
      .join("")
    const body = `
<p><a href="/clients">← Clients</a></p>
<div class="card"><h1>${esc(clientName(c))} <code>${esc(c.values.csg_clientid)}</code></h1>
<p class="lead">Row version <code>${c.version}</code> · last modified ${esc(new Date(c.modifiedOn).toLocaleString("en-AU", { timeZone: "Australia/Perth" }))} by <strong>${esc(c.modifiedBy)}</strong>. Saving here is an edit made in ICIS by staff, not through the Data Binding Service — so a form opened before it will get a conflict rather than overwrite it.</p>
${saved ? `<div class="notice">Saved in ICIS.</div>` : ""}
<form method="post"><div class="grid">${fields}</div><p><button type="submit">Save in ICIS</button></p></form></div>`
    return reply.type("text/html").send(layout(clientName(c), "/clients", body))
  })

  app.post("/clients/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const form = (request.body ?? {}) as Record<string, string>
    const values: Record<string, string | null> = {}
    for (const a of CONTACT.attributes) {
      if (a.logicalName in form) {
        const value = String(form[a.logicalName]).trim()
        values[a.logicalName] = value === "" ? null : value.slice(0, a.maxLength ?? 4000)
      }
    }
    state.updateAsStaff(id, values)
    return reply.redirect(`/clients/${id}?saved=1`)
  })

  app.get("/service-account", async (request, reply) => {
    const saved = (request.query as { saved?: string }).saved
    const groups = PRIVILEGE_GROUPS.map(
      (group) => `<h2>${esc(group.table.displayName)} <code>${group.table.logicalName}</code></h2>
${group.rows
  .map((row) => {
    const name = group.table.privileges[row.type as keyof typeof group.table.privileges]!
    return `<label><input type="checkbox" name="privilege" value="${name}" ${state.privileges.has(name) ? "checked" : ""}><span><strong>${row.type}</strong> <code>${name}</code><small>${esc(row.note)}</small></span></label>`
  })
  .join("")}`,
    ).join("")
    const body = `
<div class="card"><h1>Service account: ${esc(SERVICE_ACCOUNT.name)}</h1>
<p class="lead">The Dataverse application user the Data Binding Service signs in as, and its security role's privileges. The service checks these live — whatever this account can't do, no binding can offer. Changes take effect on the service's next request.</p>
${saved ? `<div class="notice">Privileges updated.</div>` : ""}
<form method="post" class="priv">${groups}<input type="hidden" name="privilege" value=""><p><button type="submit">Save role</button></p></form></div>`
    return reply.type("text/html").send(layout("Service account", "/service-account", body))
  })

  app.post("/service-account", async (request, reply) => {
    const form = (request.body ?? {}) as { privilege?: string | string[] }
    const chosen = ([] as string[]).concat(form.privilege ?? []).filter(Boolean)
    state.privileges = new Set(chosen)
    return reply.redirect("/service-account?saved=1")
  })

  app.get("/api-log", async (_request, reply) => {
    const body = `
<div class="card"><h1>API log</h1>
<p class="lead">Every Dataverse Web API call the Data Binding Service has made, newest first. form-builder itself never appears here — it only ever talks to the service. Refreshes every 3 seconds.</p>
<table><thead><tr><th>Time (Perth)</th><th>Method</th><th>Status</th><th>Request</th></tr></thead><tbody>
${state.log
  .map(
    (e) => `<tr><td>${esc(new Date(e.at).toLocaleTimeString("en-AU", { timeZone: "Australia/Perth" }))}</td><td>${e.method}</td><td class="status-${String(e.status)[0]}">${e.status}</td><td><code>${esc(e.path)}</code></td></tr>`,
  )
  .join("") || `<tr><td colspan="4">No calls yet.</td></tr>`}
</tbody></table></div>`
    return reply.type("text/html").send(layout("API log", "/api-log", body, 3))
  })

  app.post("/reset", async (_request, reply) => {
    state.reset()
    return reply.redirect("/clients")
  })
}
