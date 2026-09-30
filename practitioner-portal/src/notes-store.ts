import { SEEDED_NOTES } from "./seed/notes"
import type { SessionNote } from "./seed/types"

// Session notes, as the session-notes system would store them: the seeded
// ones plus whatever's been saved in this browser. Browser storage is fine
// for a mock -- it's per viewer and disposable, and "Reset portal notes"
// puts the seed back.

const KEY = "practitioner-portal.notes.v1"
// Notes saved while browser storage is unavailable.
const memory: Record<string, SessionNote> = {}

function saved(): Record<string, SessionNote> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, SessionNote>
  } catch {
    return {}
  }
}

export const noteKey = (caseNumber: string | null, subject: string) => `${caseNumber ?? "—"}|${subject}`

export function loadNote(key: string): SessionNote | null {
  return memory[key] ?? saved()[key] ?? SEEDED_NOTES[key] ?? null
}

export function saveNote(key: string, note: SessionNote) {
  memory[key] = note
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...saved(), [key]: note }))
  } catch {
    // Storage unavailable (private window): the note lasts until reload.
  }
}

export function resetNotes() {
  for (const key of Object.keys(memory)) delete memory[key]
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
