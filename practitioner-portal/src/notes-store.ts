import { SEEDED_NOTES } from "./seed/notes"
import type { NoteIcisChange, SessionNote } from "./seed/types"

// Session notes, as the session-notes system stores them: the seeded ones
// plus whatever's been saved to the portal's own Postgres database, through
// /api/notes (server/notes-api.ts). All saved notes are read once when the
// portal loads, so the views can look them up synchronously; every save
// writes through to the database before it counts. "Reset portal notes"
// empties the database, which puts the seed back.

let saved: Record<string, SessionNote> = {}
// Set when the notes database couldn't be read at load.
let unavailable: string | null = null

export class NotesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotesError"
  }
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`/api/notes${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new NotesError("The portal's notes database is unavailable")
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null
    throw new NotesError(data?.message ?? "The portal's notes database is unavailable")
  }
  return res
}

export async function loadNotes() {
  try {
    saved = (await (await request("GET", "")).json()) as Record<string, SessionNote>
    unavailable = null
  } catch (error) {
    unavailable = (error as Error).message
  }
}

export const notesUnavailable = () => unavailable

// Keyed by case number and session subject: both staff-facing and stable
// across resets, unlike anchor IDs.
export const noteKey = (caseNumber: string | null, subject: string | null) =>
  `${caseNumber ?? "—"}|${subject ?? "(no subject)"}`

export function loadNote(key: string): SessionNote | null {
  return saved[key] ?? SEEDED_NOTES[key] ?? null
}

// Saves a draft. Resolves once it's in the database; throws a NotesError
// if it isn't, leaving what's loaded unchanged.
export async function saveNote(key: string, note: SessionNote) {
  await request("PUT", `/${encodeURIComponent(key)}`, note)
  saved = { ...saved, [key]: note }
}

// Submits a note and its ICIS changes in one request, which the notes
// server stores in one transaction. `submitId` is picked when the note is
// opened: if the connection drops before an answer, the same submit is
// sent again, and the server recognises it rather than storing it twice.
// Resolves with the note as stored (its ICIS changes may still be sending);
// throws a NotesError once it's given up -- the note then isn't saved.
export async function submitNote(
  key: string,
  submitId: string,
  note: SessionNote,
  changes: NoteIcisChange[],
  onRetry?: (attempt: number) => void,
): Promise<SessionNote> {
  const delays = [1000, 2000, 4000, 8000]
  for (let attempt = 0; ; attempt++) {
    try {
      const stored = (await (
        await request("POST", `/${encodeURIComponent(key)}/submit`, { submitId, note, changes })
      ).json()) as SessionNote
      saved = { ...saved, [key]: stored }
      return stored
    } catch (error) {
      if (attempt >= delays.length) throw error
      onRetry?.(attempt + 1)
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }
}

// The note as the server has it now -- to follow ICIS changes it's still sending.
export async function refreshNote(key: string): Promise<SessionNote | null> {
  const note = (await (await request("GET", `/${encodeURIComponent(key)}`)).json()) as SessionNote
  saved = { ...saved, [key]: note }
  return note
}

export async function resetNotes() {
  await request("DELETE", "")
  saved = {}
}
