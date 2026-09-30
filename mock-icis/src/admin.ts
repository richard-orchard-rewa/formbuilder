import type { FastifyInstance } from "fastify"
import {
  ATTENDANCE_STATUSES,
  CONTACT,
  CSG_ATTENDANCE,
  CSG_CASECLIENT,
  INCIDENT,
  LOOKUP_ROWS,
  LOOKUP_TABLES,
  PORTAL_DEMO_PRIVILEGES,
  SERVICE_ACCOUNT,
  SYSTEMUSER,
  WP_SESSION,
  type RecordRow,
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
<nav>${link("/clients", "Clients")}${link("/cases", "Cases")}${link("/sessions", "Sessions")}${link("/service-account", "Service account")}${link("/api-log", "API log")}</nav>
<form method="post" action="/reset" onsubmit="return confirm('Reset all clients, privileges and the API log to the demo seed?')"><button class="secondary" type="submit">Reset demo</button></form>
</header><main>${body}</main></body></html>`
}

function lookupLabel(state: MockIcisState, table: string | undefined, id: string | number | null) {
  return table ? (state.lookupName(table, id) ?? "") : ""
}

function clientName(c: RecordRow) {
  return [c.values.firstname, c.values.lastname].filter(Boolean).join(" ")
}

// Privileges the demo lets you grant, with what each means for bindings.
const PRIVILEGE_GROUPS = [
  {
    table: WP_SESSION,
    rows: [
      { type: "Read", note: "Resolve session details (subject, times) and list a client's sessions." },
      { type: "Write", note: "Save a session's setting back." },
      { type: "Append", note: "Set a session's lookups (setting) when saving." },
    ],
  },
  {
    table: INCIDENT,
    rows: [
      { type: "Read", note: "Find cases by number and resolve case bindings (program, stage, …)." },
      { type: "Write", note: "Save a case's referral source and stage back." },
      { type: "Append", note: "Set a case's lookups (referral source) when saving." },
    ],
  },
  {
    table: CSG_CASECLIENT,
    rows: [{ type: "Read", note: "List the clients on a case." }],
  },
  {
    table: CSG_ATTENDANCE,
    rows: [
      { type: "Read", note: "List who took part in a session, and their attendance status." },
      { type: "Write", note: "Save a participant's attendance status back." },
    ],
  },
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
      { type: "AppendTo", note: `Let a record be linked to a ${table.displayName.toLowerCase()} when saving.` },
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
    (c) => `<tr><td><a href="/clients/${c.id}">${esc(c.values.csg_clientid)}</a></td>
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
    state.updateAsStaff("contact", id, values)
    return reply.redirect(`/clients/${id}?saved=1`)
  })

  const perthTime = (iso: unknown) =>
    iso ? new Date(String(iso)).toLocaleString("en-AU", { timeZone: "Australia/Perth" }) : ""
  const stageOptions = INCIDENT.attributes.find((a) => a.logicalName === "csg_casestage")!.options!
  const listSelect = (name: string, table: string, value: unknown) =>
    `<select name="${name}" aria-label="${esc(name)}"><option value="">—</option>${LOOKUP_ROWS[table]
      .map((r) => `<option value="${r.id}" ${r.id === value ? "selected" : ""}>${esc(r.name)}</option>`)
      .join("")}</select>`
  const caseSessions = (caseId: string) =>
    [...state.sessions.values()]
      .filter((s) => s.values.regardingobjectid === caseId)
      .sort((a, b) => String(a.values.scheduledstart).localeCompare(String(b.values.scheduledstart)))

  // Cases (incident), each with its clients (csg_caseclient) and the
  // sessions regarding it -- the practitioner portal demo's caseload.
  app.get("/cases", async (_request, reply) => {
    const rows = [...state.table("incident").values()].sort((a, b) =>
      String(a.values.ticketnumber).localeCompare(String(b.values.ticketnumber)),
    )
    const body = `
<div class="card"><h1>Cases</h1>
<p class="lead">Made-up cases shaped like ICIS's <code>incident</code> table, with their clients (<code>csg_caseclient</code>) and the sessions regarding them (<code>wp_session</code>). The practitioner portal demo's caseload.</p></div>
<div class="card"><table><thead><tr><th>Case number</th><th>Title</th><th>Program</th><th>Stage</th><th>Clients</th><th>Sessions</th><th>Last modified</th></tr></thead><tbody>
${rows
  .map((r) => {
    const clients = [...state.table("csg_caseclient").values()]
      .filter((cc) => cc.values.csg_caseid === r.id)
      .map((cc) => state.contacts.get(String(cc.values.csg_contactid)))
    return `<tr><td><a href="/cases/${r.id}">${esc(r.values.ticketnumber)}</a></td><td>${esc(r.values.title)}</td>
<td>${esc(lookupLabel(state, "csg_program", r.values.csg_programid as string | null))}</td>
<td>${esc(stageOptions.find((o) => o.value === r.values.csg_casestage)?.label)}</td>
<td>${clients.map((c) => (c ? esc(clientName(c)) : "")).join("<br>")}</td>
<td>${caseSessions(r.id).length}</td>
<td>${esc(perthTime(r.modifiedOn))}<br><code>${esc(r.modifiedBy)}</code></td></tr>`
  })
  .join("")}
</tbody></table></div>`
    return reply.type("text/html").send(layout("Cases", "/cases", body))
  })

  app.get("/cases/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const saved = (request.query as { saved?: string }).saved
    const r = state.table("incident").get(id)
    if (!r) return reply.code(404).type("text/html").send(layout("Not found", "/cases", `<div class="card">No such case.</div>`))
    const body = `
<p><a href="/cases">← Cases</a></p>
<div class="card"><h1>${esc(r.values.title)} <code>${esc(r.values.ticketnumber)}</code></h1>
<p class="lead">Row version <code>${r.version}</code> · last modified ${esc(perthTime(r.modifiedOn))} by <strong>${esc(r.modifiedBy)}</strong>. Saving here is an edit by ICIS staff, so a session note opened before it gets a conflict rather than overwriting it.</p>
${saved ? `<div class="notice">Saved in ICIS.</div>` : ""}
<form method="post"><div class="grid">
<label>Program<br><code>csg_programid</code></label><div>${esc(lookupLabel(state, "csg_program", r.values.csg_programid as string | null))}</div>
<label>Location<br><code>csg_locationid</code></label><div>${esc(lookupLabel(state, "csg_location", r.values.csg_locationid as string | null))}</div>
<label for="referral">Referral Source<br><code>csg_referralsourceid</code></label><div>${listSelect("csg_referralsourceid", "csg_referralsource", r.values.csg_referralsourceid).replace("<select", `<select id="referral"`)}</div>
<label for="stage">Case Stage<br><code>csg_casestage</code></label><div><select id="stage" name="csg_casestage">${stageOptions
      .map((o) => `<option value="${o.value}" ${o.value === r.values.csg_casestage ? "selected" : ""}>${esc(o.label)}</option>`)
      .join("")}</select></div>
</div><p><button type="submit">Save in ICIS</button></p></form></div>
<div class="card"><h2>Sessions regarding this case</h2>
<table><thead><tr><th>When (Perth)</th><th>Subject</th><th>Type</th><th>Setting</th><th>Attendance</th></tr></thead><tbody>
${caseSessions(id)
  .map((s) => {
    const attendees = [...state.attendances.values()].filter((a) => a.values.csg_sessionid === s.id)
    return `<tr><td>${esc(perthTime(s.values.scheduledstart))}</td><td>${esc(s.values.subject)}</td>
<td>${esc(lookupLabel(state, "csg_sessiontype", s.values.csg_sessiontypeid as string | null))}</td>
<td><form method="post" action="/sessions/${s.id}/setting?back=${encodeURIComponent(`/cases/${id}`)}" style="display:flex;gap:8px">${listSelect("csg_sessionsettingid", "csg_sessionsetting", s.values.csg_sessionsettingid)}<button type="submit" class="secondary">Save in ICIS</button></form></td>
<td>${attendees
      .map((a) => `${esc(clientName(state.contacts.get(String(a.values.csg_contactid))!))}: ${esc(ATTENDANCE_STATUSES.find((o) => o.value === a.values.wp_attendancestatus)?.label)}`)
      .join("<br>")}</td></tr>`
  })
  .join("")}
</tbody></table><p class="lead">Edit attendance on the <a href="/sessions">Sessions</a> page.</p></div>`
    return reply.type("text/html").send(layout(String(r.values.title), "/cases", body))
  })

  app.post("/cases/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const form = (request.body ?? {}) as { csg_referralsourceid?: string; csg_casestage?: string }
    const referral = String(form.csg_referralsourceid ?? "")
    const stage = Number(form.csg_casestage)
    state.updateAsStaff("incident", id, {
      csg_referralsourceid: LOOKUP_ROWS.csg_referralsource.some((r) => r.id === referral) ? referral : null,
      ...(stageOptions.some((o) => o.value === stage) ? { csg_casestage: stage } : {}),
    })
    return reply.redirect(`/cases/${id}?saved=1`)
  })

  app.post("/sessions/:id/setting", async (request, reply) => {
    const { id } = request.params as { id: string }
    const back = String((request.query as { back?: string }).back ?? "/cases")
    const value = String(((request.body ?? {}) as { csg_sessionsettingid?: string }).csg_sessionsettingid ?? "")
    state.updateAsStaff("wp_session", id, {
      csg_sessionsettingid: LOOKUP_ROWS.csg_sessionsetting.some((r) => r.id === value) ? value : null,
    })
    return reply.redirect(`${back.startsWith("/") ? back : "/cases"}?saved=1`)
  })

  app.get("/sessions", async (request, reply) => {
    const saved = (request.query as { saved?: string }).saved
    const perth = (iso: unknown) =>
      iso ? new Date(String(iso)).toLocaleString("en-AU", { timeZone: "Australia/Perth" }) : ""
    const sessions = [...state.sessions.values()].sort((a, b) =>
      String(b.values.scheduledstart).localeCompare(String(a.values.scheduledstart)),
    )
    const statusSelect = (row: RecordRow) =>
      `<select name="wp_attendancestatus" aria-label="Attendance status">${ATTENDANCE_STATUSES.map(
        (o) => `<option value="${o.value}" ${o.value === row.values.wp_attendancestatus ? "selected" : ""}>${esc(o.label)}</option>`,
      ).join("")}</select>`
    const body = `
<div class="card"><h1>Sessions</h1>
<p class="lead">Made-up sessions (ICIS <code>wp_session</code>) and who attended each (<code>csg_attendance</code>, one per person per session). Changing an attendance status here is an edit by ICIS staff, so a session note opened before it gets a conflict for that participant.</p>
${saved ? `<div class="notice">Saved in ICIS.</div>` : ""}</div>
${sessions
  .map((session) => {
    const attendees = [...state.attendances.values()].filter(
      (a) => a.values.csg_sessionid === session.id,
    )
    return `<div class="card"><h2>${esc(session.values.subject)}</h2>
<p class="lead">${esc(perth(session.values.scheduledstart))} – ${esc(perth(session.values.scheduledend))} · <code>${session.id}</code></p>
<table><thead><tr><th>Participant</th><th>Client number</th><th>Attendance</th><th>Last modified</th></tr></thead><tbody>
${attendees
  .map((a) => {
    const contact = state.contacts.get(String(a.values.csg_contactid))
    return `<tr><td>${contact ? `<a href="/clients/${contact.id}">${esc(clientName(contact))}</a>` : ""}</td>
<td>${esc(contact?.values.csg_clientid)}</td>
<td><form method="post" action="/sessions/attendance/${a.id}" style="display:flex;gap:8px">${statusSelect(a)}<button type="submit" class="secondary">Save in ICIS</button></form></td>
<td>${esc(new Date(a.modifiedOn).toLocaleString("en-AU", { timeZone: "Australia/Perth" }))}<br><code>${esc(a.modifiedBy)}</code></td></tr>`
  })
  .join("")}
</tbody></table></div>`
  })
  .join("")}`
    return reply.type("text/html").send(layout("Sessions", "/sessions", body))
  })

  app.post("/sessions/attendance/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const form = (request.body ?? {}) as { wp_attendancestatus?: string }
    const value = Number(form.wp_attendancestatus)
    if (ATTENDANCE_STATUSES.some((o) => o.value === value)) {
      state.updateAsStaff("csg_attendance", id, { wp_attendancestatus: value })
    }
    return reply.redirect("/sessions?saved=1")
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

  // Also what the portal demo's seed script calls (practitioner-portal/scripts).
  app.post("/service-account/grant-portal-demo", async (_request, reply) => {
    for (const name of PORTAL_DEMO_PRIVILEGES) state.privileges.add(name)
    return reply.redirect("/service-account?saved=1")
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
