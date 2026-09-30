import type { FastifyInstance } from "fastify"
import {
  ATTENDANCE,
  CASECLIENT,
  CONTACT,
  INCIDENT,
  LOOKUP_ROWS,
  LOOKUP_TABLES,
  PORTAL_DEMO_PRIVILEGES,
  SERVICE_ACCOUNT,
  SESSION_STATES,
  SYSTEMUSER,
  WP_SESSION,
  type ContactRow,
  type EntityDef,
  type RecordRow,
  type Value,
} from "./data.js"
import type { MockIcisState } from "./state.js"

// The mock's own screens, for demonstrating the ICIS side of data binding:
// browse and edit client, case and session records as ICIS staff would,
// grant or revoke the Data Binding Service account's privileges, and watch
// every API call the service makes. Plain server-rendered HTML -- it's a
// prop, not a product.

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
  .inline { display:flex; gap:8px; align-items:center; }
  .inline select { width:auto; }
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
<nav>${link("/clients", "Clients")}${link("/cases", "Cases")}${link("/service-account", "Service account")}${link("/api-log", "API log")}</nav>
<form method="post" action="/reset" onsubmit="return confirm('Reset all records, privileges and the API log to the demo seed?')"><button class="secondary" type="submit">Reset demo</button></form>
</header><main>${body}</main></body></html>`
}

const perth = (iso: Value | undefined) =>
  iso ? new Date(String(iso)).toLocaleString("en-AU", { timeZone: "Australia/Perth", dateStyle: "medium", timeStyle: "short" }) : ""

function lookupLabel(state: MockIcisState, table: string | undefined, id: Value | undefined) {
  return table ? (state.lookupName(table, id) ?? "") : ""
}

function optionLabel(entity: EntityDef, attribute: string, value: Value | undefined) {
  const def = entity.attributes.find((a) => a.logicalName === attribute)
  return def?.options?.find((o) => o.value === value)?.label ?? ""
}

function clientName(c: ContactRow | undefined) {
  return c ? [c.values.firstname, c.values.lastname].filter(Boolean).join(" ") : ""
}

function modified(row: RecordRow) {
  return `${esc(perth(row.modifiedOn))}<br><code>${esc(row.modifiedBy)}</code>`
}

// Privileges the demo lets you grant, with what each means for bindings.
const PRIVILEGE_GROUPS: Array<{ table: EntityDef; rows: Array<{ type: string; note: string }> }> = [
  {
    table: CONTACT,
    rows: [
      { type: "Read", note: "Resolve client values; find clients by number. Without it, nothing works." },
      { type: "Write", note: "Save edited values back. Without it, every binding is display-only." },
      { type: "Append", note: "Set a client's lookups (title, gender, …) when saving." },
    ],
  },
  {
    table: INCIDENT,
    rows: [
      { type: "Read", note: "Find cases by number and resolve case bindings." },
      { type: "Write", note: "Save a case's referral source and stage back." },
      { type: "Append", note: "Set a case's lookups (referral source) when saving." },
    ],
  },
  {
    table: CASECLIENT,
    rows: [{ type: "Read", note: "List the clients on a case." }],
  },
  {
    table: WP_SESSION,
    rows: [
      { type: "Read", note: "List a case's sessions and resolve session bindings. (Sessions are activities: this is every activity type.)" },
      { type: "Write", note: "Save a session's setting back. Write on every activity type in the org — grant with care." },
      { type: "Append", note: "Set a session's lookups (setting) when saving." },
    ],
  },
  {
    table: ATTENDANCE,
    rows: [
      { type: "Read", note: "List who is booked into a session and resolve their attendance." },
      { type: "Write", note: "Save attendance back." },
    ],
  },
  ...LOOKUP_TABLES.map((table) => ({
    table,
    rows: [
      { type: "Read", note: `Show the ${table.displayName.toLowerCase()} list as options. Without it, a lookup binding can't be published.` },
      { type: "AppendTo", note: `Let a record be linked to a ${table.displayName.toLowerCase()} when saving.` },
    ],
  })),
  {
    table: SYSTEMUSER,
    rows: [{ type: "Read", note: "Lets the service check its own privileges (RetrieveUserPrivileges)." }],
  },
]

// An editable form over one record's attributes, as ICIS staff would see
// it. Saving is an edit made in ICIS, not through the service.
function recordFields(entity: EntityDef, row: RecordRow, only?: string[]) {
  return entity.attributes
    .filter((a) => !only || only.includes(a.logicalName))
    .map((a) => {
      const value = row.values[a.logicalName] ?? ""
      const fieldId = `${entity.logicalName}-${row.id}-${a.logicalName}`
      let input: string
      if (a.type === "Lookup" && LOOKUP_ROWS[a.target!]) {
        input = `<select id="${fieldId}" name="${a.logicalName}"><option value="">—</option>${LOOKUP_ROWS[a.target!]
          .map((r) => `<option value="${r.id}" ${r.id === value ? "selected" : ""}>${esc(r.name)}</option>`)
          .join("")}</select>`
      } else if (a.type === "Lookup") {
        input = `<code>${esc(value)}</code>`
      } else if (a.type === "Picklist" || a.type === "State") {
        input = `<select id="${fieldId}" name="${a.logicalName}"><option value="">—</option>${a.options!
          .map((o) => `<option value="${o.value}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`)
          .join("")}</select>`
      } else if (a.type === "Boolean") {
        input = `<code>${value === true ? "Yes" : "No"}</code>`
      } else {
        input = `<input type="text" id="${fieldId}" name="${a.logicalName}" value="${esc(value)}"${a.maxLength ? ` maxlength="${a.maxLength}"` : ""}>`
      }
      return `<label for="${fieldId}">${esc(a.displayName)}<br><code>${a.logicalName}</code>${a.sensitive ? ` <span class="sensitive">${esc(a.sensitive)}</span>` : ""}</label><div>${input}</div>`
    })
    .join("")
}

// Form values back into record values, by attribute type.
function formValues(entity: EntityDef, form: Record<string, string>) {
  const values: Record<string, Value> = {}
  for (const a of entity.attributes) {
    if (!(a.logicalName in form)) continue
    const raw = String(form[a.logicalName]).trim()
    if (a.type === "Picklist" || a.type === "State") {
      values[a.logicalName] = raw === "" ? null : Number(raw)
    } else if (a.type === "String" || a.type === "Lookup" || a.type === "DateTime") {
      values[a.logicalName] = raw === "" ? null : raw.slice(0, a.maxLength ?? 4000)
    }
  }
  return values
}

const EDITABLE: Record<string, EntityDef> = {
  contact: CONTACT,
  incident: INCIDENT,
  wp_session: WP_SESSION,
  csg_attendance: ATTENDANCE,
}

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
    (c) => `<tr><td><a href="/clients/${c.id}">${esc(c.values.csg_clientid)}</a></td>
<td>${esc(lookupLabel(state, "csg_salutation", c.values.csg_salutationid))}</td>
<td>${esc(clientName(c))}</td><td>${esc(c.values.csg_alias)}</td>
<td>${esc(lookupLabel(state, "csg_gender", c.values.csg_genderid))}</td>
<td>${esc(lookupLabel(state, "csg_language", c.values.csg_home_languageid))}</td>
<td>${modified(c)}</td></tr>`,
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
    const body = `
<p><a href="/clients">← Clients</a></p>
<div class="card"><h1>${esc(clientName(c))} <code>${esc(c.values.csg_clientid)}</code></h1>
<p class="lead">Row version <code>${c.version}</code> · last modified ${esc(perth(c.modifiedOn))} by <strong>${esc(c.modifiedBy)}</strong>. Saving here is an edit made in ICIS by staff, not through the Data Binding Service — so a form opened before it will get a conflict rather than overwrite it.</p>
${saved ? `<div class="notice">Saved in ICIS.</div>` : ""}
<form method="post" action="/records/contact/${c.id}?back=${encodeURIComponent(`/clients/${c.id}`)}"><div class="grid">${recordFields(CONTACT, c)}</div><p><button type="submit">Save in ICIS</button></p></form></div>`
    return reply.type("text/html").send(layout(clientName(c), "/clients", body))
  })

  // Legacy form target, kept so bookmarked client pages still save.
  app.post("/clients/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    state.updateAsStaff(id, formValues(CONTACT, (request.body ?? {}) as Record<string, string>))
    return reply.redirect(`/clients/${id}?saved=1`)
  })

  app.post("/records/:entity/:id", async (request, reply) => {
    const { entity, id } = request.params as { entity: string; id: string }
    const back = String((request.query as { back?: string }).back ?? "/")
    const def = EDITABLE[entity]
    if (!def || !back.startsWith("/")) return reply.code(400).send("Not editable here")
    state.updateRecordAsStaff(entity, id, formValues(def, (request.body ?? {}) as Record<string, string>))
    return reply.redirect(`${back}${back.includes("?") ? "&" : "?"}saved=1`)
  })

  const caseClients = (caseId: string) =>
    [...state.table("csg_caseclient").values()].filter((r) => r.values.csg_caseid === caseId)
  const caseSessions = (caseId: string) =>
    [...state.table("wp_session").values()]
      .filter((r) => r.values.regardingobjectid === caseId)
      .sort((a, b) => String(a.values.scheduledstart).localeCompare(String(b.values.scheduledstart)))
  const sessionAttendance = (sessionId: string) =>
    [...state.table("csg_attendance").values()].filter((r) => r.values.csg_sessionid === sessionId)

  app.get("/cases", async (_request, reply) => {
    const rows = [...state.table("incident").values()].sort((a, b) =>
      String(a.values.ticketnumber).localeCompare(String(b.values.ticketnumber)),
    )
    const body = `
<div class="card"><h1>Cases</h1>
<p class="lead">Made-up cases shaped like ICIS's <code>incident</code> table, each with its clients (<code>csg_caseclient</code>), its sessions (<code>wp_session</code>, regarding the case) and who attended each (<code>csg_attendance</code>). These are the practitioner portal demo's caseload.</p></div>
<div class="card"><table><thead><tr><th>Case number</th><th>Title</th><th>Program</th><th>Stage</th><th>Clients</th><th>Sessions</th><th>Last modified</th></tr></thead><tbody>
${rows
  .map(
    (r) => `<tr><td><a href="/cases/${r.id}">${esc(r.values.ticketnumber)}</a></td><td>${esc(r.values.title)}</td>
<td>${esc(lookupLabel(state, "csg_program", r.values.csg_programid))}</td>
<td>${esc(optionLabel(INCIDENT, "csg_casestage", r.values.csg_casestage))}</td>
<td>${caseClients(r.id).map((cc) => esc(clientName(state.contacts.get(String(cc.values.csg_contactid))))).join("<br>")}</td>
<td>${caseSessions(r.id).length}</td><td>${modified(r)}</td></tr>`,
  )
  .join("")}
</tbody></table></div>`
    return reply.type("text/html").send(layout("Cases", "/cases", body))
  })

  app.get("/cases/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const saved = (request.query as { saved?: string }).saved
    const r = state.table("incident").get(id)
    if (!r) return reply.code(404).type("text/html").send(layout("Not found", "/cases", `<div class="card">No such case.</div>`))
    const here = `/cases/${id}`
    const body = `
<p><a href="/cases">← Cases</a></p>
<div class="card"><h1>${esc(r.values.title)} <code>${esc(r.values.ticketnumber)}</code></h1>
<p class="lead">Row version <code>${r.version}</code> · last modified ${esc(perth(r.modifiedOn))} by <strong>${esc(r.modifiedBy)}</strong>.</p>
${saved ? `<div class="notice">Saved in ICIS.</div>` : ""}
<form method="post" action="/records/incident/${id}?back=${encodeURIComponent(here)}"><div class="grid">${recordFields(INCIDENT, r)}</div><p><button type="submit">Save in ICIS</button></p></form></div>
<div class="card"><h2>Clients on this case</h2><table><thead><tr><th>Client number</th><th>Name</th><th>Primary</th></tr></thead><tbody>
${caseClients(id)
  .map((cc) => {
    const c = state.contacts.get(String(cc.values.csg_contactid))
    return `<tr><td>${c ? `<a href="/clients/${c.id}">${esc(c.values.csg_clientid)}</a>` : ""}</td><td>${esc(clientName(c))}</td><td>${cc.values.csg_isprimary ? "Yes" : ""}</td></tr>`
  })
  .join("")}
</tbody></table></div>
<div class="card"><h2>Sessions</h2><table><thead><tr><th>When (Perth)</th><th>Subject</th><th>Type</th><th>Setting</th><th>Status</th><th>Attendance</th><th>Last modified</th></tr></thead><tbody>
${caseSessions(id)
  .map(
    (s) => `<tr><td>${esc(perth(s.values.scheduledstart))}</td><td><a href="/sessions/${s.id}">${esc(s.values.subject)}</a></td>
<td>${esc(lookupLabel(state, "csg_sessiontype", s.values.csg_sessiontypeid))}</td>
<td>${esc(lookupLabel(state, "csg_sessionsetting", s.values.csg_sessionsettingid))}</td>
<td>${esc(SESSION_STATES.find((o) => o.value === s.values.statecode)?.label)}</td>
<td>${sessionAttendance(s.id)
  .map((a) => `${esc(clientName(state.contacts.get(String(a.values.csg_contactid))))}: ${esc(optionLabel(ATTENDANCE, "wp_attendancestatus", a.values.wp_attendancestatus))}`)
  .join("<br>")}</td><td>${modified(s)}</td></tr>`,
  )
  .join("")}
</tbody></table></div>`
    return reply.type("text/html").send(layout(String(r.values.title), "/cases", body))
  })

  app.get("/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const saved = (request.query as { saved?: string }).saved
    const s = state.table("wp_session").get(id)
    if (!s) return reply.code(404).type("text/html").send(layout("Not found", "/cases", `<div class="card">No such session.</div>`))
    const here = `/sessions/${id}`
    const caseRow = state.table("incident").get(String(s.values.regardingobjectid))
    const body = `
<p>${caseRow ? `<a href="/cases/${caseRow.id}">← ${esc(caseRow.values.title)}</a>` : `<a href="/cases">← Cases</a>`}</p>
<div class="card"><h1>${esc(s.values.subject)}</h1>
<p class="lead">A <code>wp_session</code> activity, ${esc(perth(s.values.scheduledstart))} (Perth). Row version <code>${s.version}</code> · last modified ${esc(perth(s.modifiedOn))} by <strong>${esc(s.modifiedBy)}</strong>.</p>
${saved ? `<div class="notice">Saved in ICIS.</div>` : ""}
<form method="post" action="/records/wp_session/${id}?back=${encodeURIComponent(here)}"><div class="grid">${recordFields(WP_SESSION, s, ["subject", "csg_sessiontypeid", "csg_sessionsettingid", "statecode"])}</div><p><button type="submit">Save in ICIS</button></p></form></div>
<div class="card"><h2>Attendance</h2><p class="lead">One <code>csg_attendance</code> row per client booked into the session.</p>
<table><thead><tr><th>Client</th><th>Attendance status</th><th>Last modified</th></tr></thead><tbody>
${sessionAttendance(id)
  .map(
    (a) => `<tr><td>${esc(clientName(state.contacts.get(String(a.values.csg_contactid))))}</td>
<td><form class="inline" method="post" action="/records/csg_attendance/${a.id}?back=${encodeURIComponent(here)}">${recordFields(ATTENDANCE, a, ["wp_attendancestatus"]).replace(/<label[\s\S]*?<\/label>/, "")}<button type="submit">Save in ICIS</button></form></td>
<td>${modified(a)}</td></tr>`,
  )
  .join("")}
</tbody></table></div>`
    return reply.type("text/html").send(layout(String(s.values.subject), "/cases", body))
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
<form method="post" action="/service-account/grant-portal-demo"><p><button class="secondary" type="submit">Grant what the practitioner portal demo needs</button></p></form>
<form method="post" class="priv">${groups}<input type="hidden" name="privilege" value=""><p><button type="submit">Save role</button></p></form></div>`
    return reply.type("text/html").send(layout("Service account", "/service-account", body))
  })

  app.post("/service-account", async (request, reply) => {
    const form = (request.body ?? {}) as { privilege?: string | string[] }
    const chosen = ([] as string[]).concat(form.privilege ?? []).filter(Boolean)
    state.privileges = new Set(chosen)
    return reply.redirect("/service-account?saved=1")
  })

  // Used by the portal demo's seed script too (practitioner-portal/scripts).
  app.post("/service-account/grant-portal-demo", async (_request, reply) => {
    for (const name of PORTAL_DEMO_PRIVILEGES) state.privileges.add(name)
    return reply.redirect("/service-account?saved=1")
  })

  app.get("/api-log", async (_request, reply) => {
    const body = `
<div class="card"><h1>API log</h1>
<p class="lead">Every Dataverse Web API call the Data Binding Service has made, newest first. form-builder and the practitioner portal never appear here — they only ever talk to the service. Refreshes every 3 seconds.</p>
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
