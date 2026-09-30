import type { IncomingMessage, ServerResponse } from "node:http"
import pg from "pg"
import type { BindingCommitResult, BoundValues, CommitResponse } from "shared"
import type { Plugin } from "vite"
import type { NoteIcisChange, SessionNote } from "../src/seed/types"

// The session-notes system's own backend: session notes in Postgres, served
// at /api/notes by the portal's dev server. Its own database
// (practitioner_portal_demo) -- never form-builder's or the DBS's -- on the
// local Postgres from docker compose, created on first use. Bound values
// still live only in ICIS; a note keeps what it sent there and what came
// back, as the record of the submit.
//
//   GET    /api/notes               every saved note, by note key
//   GET    /api/notes/<key>         one note
//   PUT    /api/notes/<key>         save a draft
//   POST   /api/notes/<key>/submit  submit: the note and its ICIS changes
//   DELETE /api/notes               remove them all ("Reset portal notes")
//
// A submit is one request and one Postgres transaction: the note and its
// ICIS changes (an outbox row per record) are stored together or not at
// all, under a submit ID the browser picks -- so a retry after a dropped
// connection is recognised, never stored twice. The server then sends the
// outbox to the DBS itself, retrying until each record is answered, and
// resumes whatever's left after a restart. Re-sending a commit the DBS
// already applied is harmless: the values now match ICIS, so it answers
// "unchanged" rather than writing again.

const DEFAULT_URL = "postgresql://formbuilder:formbuilder@localhost:5432/practitioner_portal_demo"
// How long a submit waits for ICIS before answering "saved, still sending".
const SUBMIT_WAIT_MS = 8000
const DRAIN_EVERY_MS = 5000
const DBS_TIMEOUT_MS = 10000

const SCHEMA = `
  create table if not exists session_notes (
    note_key text primary key,
    case_number text not null,
    session_subject text not null,
    status text not null check (status in ('draft', 'submitted')),
    saved_by text not null,
    saved_at text not null,
    answers jsonb not null,
    pending_bound jsonb,
    committed jsonb,
    updated_at timestamptz not null default now()
  );
  alter table session_notes add column if not exists icis_state text
    check (icis_state in ('sending', 'sent'));
  alter table session_notes add column if not exists icis_error text;

  create table if not exists note_submits (
    submit_id text primary key,
    note_key text not null,
    received_at timestamptz not null default now()
  );

  create table if not exists icis_outbox (
    id bigserial primary key,
    submit_id text not null references note_submits (submit_id) on delete cascade,
    note_key text not null,
    group_id text not null,
    anchor jsonb not null,
    "values" jsonb not null,
    baseline jsonb,
    status text not null default 'pending' check (status in ('pending', 'done')),
    results jsonb,
    attempts integer not null default 0,
    last_error text,
    next_attempt_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    done_at timestamptz
  );
`

type Queryable = pg.Pool | pg.PoolClient

interface OutboxRow {
  id: string
  submit_id: string
  note_key: string
  group_id: string
  anchor: NoteIcisChange["anchor"]
  values: BoundValues
  baseline: BoundValues | null
  attempts: number
}

// What the DBS said about one record: final, or worth another try later.
type Answer =
  | { final: true; results: Record<string, BindingCommitResult> }
  | { final: false; error: string }

class NotesStore {
  private ready: Promise<pg.Pool> | null = null
  private draining: Promise<void> | null = null

  constructor(
    private readonly url: string,
    private readonly dbsUrl: string,
  ) {}

  // Connects (creating the database and tables if need be) on first use, so
  // the portal still starts when Postgres isn't up -- saving then reports
  // the notes database as unavailable, and retries next time.
  pool(): Promise<pg.Pool> {
    if (!this.ready) {
      this.ready = this.connect()
      this.ready.catch(() => (this.ready = null))
    }
    return this.ready
  }

  private async connect() {
    const name = decodeURIComponent(new URL(this.url).pathname.slice(1))
    // Interpolated into CREATE DATABASE below, so allow only plain identifiers.
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Refusing unusual database name "${name}"`)
    const maintenance = new URL(this.url)
    maintenance.pathname = "/postgres"
    const admin = new pg.Client({ connectionString: maintenance.toString() })
    await admin.connect()
    try {
      const exists = await admin.query("select 1 from pg_database where datname = $1", [name])
      if (exists.rowCount === 0) await admin.query(`create database "${name}"`)
    } finally {
      await admin.end()
    }
    const pool = new pg.Pool({ connectionString: this.url })
    await pool.query(SCHEMA)
    return pool
  }

  private static toNote(r: Record<string, unknown>): SessionNote {
    return {
      status: r.status as SessionNote["status"],
      savedBy: r.saved_by as string,
      savedAt: r.saved_at as string,
      answers: r.answers as SessionNote["answers"],
      ...(r.pending_bound ? { pendingBound: r.pending_bound as SessionNote["pendingBound"] } : {}),
      ...(r.committed ? { committed: r.committed as SessionNote["committed"] } : {}),
      ...(r.icis_state ? { icis: r.icis_state as SessionNote["icis"] } : {}),
      ...(r.icis_error ? { icisError: r.icis_error as string } : {}),
    }
  }

  async all(): Promise<Record<string, SessionNote>> {
    const { rows } = await (await this.pool()).query("select * from session_notes")
    return Object.fromEntries(rows.map((r) => [r.note_key, NotesStore.toNote(r)]))
  }

  async one(key: string, db?: Queryable): Promise<SessionNote | null> {
    const { rows } = await (db ?? (await this.pool())).query(
      "select * from session_notes where note_key = $1",
      [key],
    )
    return rows[0] ? NotesStore.toNote(rows[0]) : null
  }

  private async write(db: Queryable, key: string, note: SessionNote, icisState: string | null) {
    // Keys are "<case number>|<session subject>" (src/notes-store.ts).
    const split = key.indexOf("|")
    await db.query(
      `insert into session_notes
         (note_key, case_number, session_subject, status, saved_by, saved_at, answers,
          pending_bound, committed, icis_state, icis_error)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null)
       on conflict (note_key) do update set
         status = excluded.status, saved_by = excluded.saved_by, saved_at = excluded.saved_at,
         answers = excluded.answers, pending_bound = excluded.pending_bound,
         committed = excluded.committed, icis_state = excluded.icis_state,
         icis_error = null, updated_at = now()`,
      [
        key,
        split < 0 ? key : key.slice(0, split),
        split < 0 ? "" : key.slice(split + 1),
        note.status,
        note.savedBy,
        note.savedAt,
        JSON.stringify(note.answers),
        note.pendingBound ? JSON.stringify(note.pendingBound) : null,
        note.committed ? JSON.stringify(note.committed) : null,
        icisState,
      ],
    )
  }

  async saveDraft(key: string, note: SessionNote) {
    await this.write(await this.pool(), key, { ...note, status: "draft" }, null)
  }

  // The note and its ICIS changes, stored in one transaction. Returns false
  // when this submit ID was already stored (a retry), leaving it untouched.
  async submit(key: string, submitId: string, note: SessionNote, changes: NoteIcisChange[]) {
    const client = await (await this.pool()).connect()
    try {
      await client.query("begin")
      const fresh = await client.query(
        "insert into note_submits (submit_id, note_key) values ($1, $2) on conflict do nothing",
        [submitId, key],
      )
      if (fresh.rowCount === 0) {
        await client.query("rollback")
        return false
      }
      await this.write(
        client,
        key,
        { ...note, status: "submitted", committed: {}, pendingBound: undefined },
        changes.length > 0 ? "sending" : "sent",
      )
      for (const change of changes) {
        await client.query(
          `insert into icis_outbox (submit_id, note_key, group_id, anchor, "values", baseline)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            submitId,
            key,
            change.group,
            JSON.stringify(change.anchor),
            JSON.stringify(change.values),
            change.baseline ? JSON.stringify(change.baseline) : null,
          ],
        )
      }
      await client.query("commit")
      return true
    } catch (error) {
      await client.query("rollback").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  // Sends every outbox row that's due to the DBS, one at a time. Only one
  // drain runs at once; a caller arriving mid-drain waits for that one.
  drain(): Promise<void> {
    if (!this.draining) {
      this.draining = this.drainOnce().finally(() => (this.draining = null))
    }
    return this.draining
  }

  private async drainOnce() {
    const pool = await this.pool()
    const { rows } = await pool.query<OutboxRow>(
      `select id, submit_id, note_key, group_id, anchor, "values", baseline, attempts
       from icis_outbox where status = 'pending' and next_attempt_at <= now() order by id`,
    )
    for (const row of rows) {
      const answer = await this.commit(row)
      if (answer.final) await this.record(pool, row, answer.results)
      else await this.retryLater(pool, row, answer.error)
    }
  }

  private async commit(row: OutboxRow): Promise<Answer> {
    let res: Response
    try {
      res = await fetch(`${this.dbsUrl}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor: row.anchor,
          values: row.values,
          ...(row.baseline ? { baseline: row.baseline } : {}),
        }),
        signal: AbortSignal.timeout(DBS_TIMEOUT_MS),
      })
    } catch {
      return { final: false, error: "The Data Binding Service couldn't be reached" }
    }
    const data = (await res.json().catch(() => null)) as (CommitResponse & { message?: string }) | null
    if (res.status >= 500 || res.status === 429) {
      return { final: false, error: data?.message ?? "The Data Binding Service is unavailable" }
    }
    if (!res.ok || !data?.results) {
      // Refused outright (a bad anchor, say): retrying won't change that.
      const message = data?.message ?? `Refused (${res.status})`
      return {
        final: true,
        results: Object.fromEntries(Object.keys(row.values).map((k) => [k, { status: "failed", message }])),
      }
    }
    return { final: true, results: data.results }
  }

  // One record answered: onto the note, in the same transaction that closes
  // the outbox row -- and once a submit's last row is in, it's "sent".
  private async record(pool: pg.Pool, row: OutboxRow, results: Record<string, BindingCommitResult>) {
    const client = await pool.connect()
    try {
      await client.query("begin")
      await client.query(
        "update icis_outbox set status = 'done', results = $2, done_at = now() where id = $1",
        [row.id, JSON.stringify(results)],
      )
      await client.query(
        `update session_notes set
           committed = jsonb_set(coalesce(committed, '{}'::jsonb), array[$2::text], $3::jsonb),
           updated_at = now()
         where note_key = $1`,
        [row.note_key, row.group_id, JSON.stringify({ values: row.values, results })],
      )
      const left = await client.query(
        "select 1 from icis_outbox where submit_id = $1 and status = 'pending' limit 1",
        [row.submit_id],
      )
      if (left.rowCount === 0) {
        await client.query(
          "update session_notes set icis_state = 'sent', icis_error = null where note_key = $1",
          [row.note_key],
        )
      }
      await client.query("commit")
    } catch (error) {
      await client.query("rollback").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  // Backs off 2s, 4s, 8s ... up to a minute between tries. It never gives
  // up by itself: an unsent change stays visible on the note until it lands.
  private async retryLater(pool: pg.Pool, row: OutboxRow, error: string) {
    const delay = Math.min(2 ** (row.attempts + 1), 60)
    await pool.query(
      `update icis_outbox set attempts = attempts + 1, last_error = $2,
         next_attempt_at = now() + make_interval(secs => $3) where id = $1`,
      [row.id, error, delay],
    )
    await pool.query("update session_notes set icis_error = $2 where note_key = $1", [row.note_key, error])
  }

  // Waits for this note's ICIS changes, up to `ms`, draining as it goes.
  async settle(key: string, ms: number) {
    const until = Date.now() + ms
    while (Date.now() < until) {
      await this.drain()
      if ((await this.one(key))?.icis !== "sending") return
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  async clear() {
    const pool = await this.pool()
    await pool.query("delete from note_submits")
    await pool.query("delete from session_notes")
  }

  async close() {
    const pool = await this.ready?.catch(() => null)
    await pool?.end()
  }
}

function isNote(value: unknown): value is SessionNote {
  const note = value as SessionNote | null
  return (
    typeof note === "object" &&
    note !== null &&
    (note.status === "draft" || note.status === "submitted") &&
    typeof note.savedBy === "string" &&
    typeof note.savedAt === "string" &&
    typeof note.answers === "object" &&
    note.answers !== null
  )
}

function isChange(value: unknown): value is NoteIcisChange {
  const change = value as NoteIcisChange | null
  return (
    typeof change === "object" &&
    change !== null &&
    typeof change.group === "string" &&
    typeof change.anchor === "object" &&
    change.anchor !== null &&
    typeof change.values === "object" &&
    change.values !== null
  )
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return null
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status
  if (body === undefined) return res.end()
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(body))
}

async function handle(store: NotesStore, req: IncomingMessage, res: ServerResponse) {
  // Mounted at /api/notes, so the URL here is "/", "/<key>" or
  // "/<key>/submit" -- split before decoding, since a key may hold "/".
  const [, rawKey = "", action] = (req.url ?? "/").split("?")[0].split("/")
  const key = decodeURIComponent(rawKey)

  if (key === "" && req.method === "GET") return send(res, 200, await store.all())
  if (key === "" && req.method === "DELETE") {
    await store.clear()
    return send(res, 204)
  }
  if (key !== "" && !action && req.method === "GET") {
    const note = await store.one(key)
    return note ? send(res, 200, note) : send(res, 404, { message: "No such note" })
  }
  if (key !== "" && !action && req.method === "PUT") {
    const note = await readJson(req)
    if (!isNote(note)) return send(res, 400, { message: "Not a session note" })
    await store.saveDraft(key, note)
    return send(res, 204)
  }
  if (key !== "" && action === "submit" && req.method === "POST") {
    const body = (await readJson(req)) as { submitId?: unknown; note?: unknown; changes?: unknown } | null
    const changes = Array.isArray(body?.changes) ? body.changes : null
    if (
      typeof body?.submitId !== "string" ||
      body.submitId.length < 8 ||
      !isNote(body.note) ||
      !changes ||
      !changes.every(isChange)
    ) {
      return send(res, 400, { message: "Not a session note submit" })
    }
    await store.submit(key, body.submitId, body.note, changes)
    await store.settle(key, SUBMIT_WAIT_MS)
    return send(res, 200, await store.one(key))
  }
  send(res, 405, { message: "Not supported" })
}

export function notesApi(
  url = process.env.PORTAL_DATABASE_URL ?? DEFAULT_URL,
  dbsUrl = process.env.BINDING_SERVICE_URL ?? "http://localhost:3100",
): Plugin {
  const store = new NotesStore(url, dbsUrl)
  return {
    name: "portal-notes-api",
    configureServer(server) {
      server.middlewares.use("/api/notes", (req, res) => {
        handle(store, req, res).catch((error: unknown) => {
          server.config.logger.error(`[notes] ${String(error)}`)
          send(res, 503, { message: "The portal's notes database is unavailable" })
        })
      })
      // Keeps working through the outbox -- including whatever a restart
      // left unsent. Not under Vitest, which has no database.
      if (process.env.VITEST) return
      let warned = false
      const timer = setInterval(() => {
        store.drain().then(
          () => (warned = false),
          (error: unknown) => {
            if (!warned) server.config.logger.warn(`[notes] outbox paused: ${String(error)}`)
            warned = true
          },
        )
      }, DRAIN_EVERY_MS)
      timer.unref()
      server.httpServer?.on("close", () => {
        clearInterval(timer)
        void store.close()
      })
    },
  }
}
