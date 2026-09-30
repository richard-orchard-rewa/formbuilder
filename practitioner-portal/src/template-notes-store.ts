import type { Data } from "./template-note"

// What the portal itself remembers about notes written from form-builder
// templates. The note lives in form-builder once it's submitted; the portal
// keeps only a pointer to it (which template, which submission) for each
// session, plus any unsent draft. Browser storage is fine for a mock -- it's
// per viewer and disposable.

const POINTERS = "practitioner-portal.template-notes.v1"
const DRAFTS = "practitioner-portal.template-drafts.v1"

export interface NotePointer {
  templateId: string
  templateName: string
  submissionId: string
  submittedAt: string
}

export interface NoteDraft {
  savedAt: string
  sessionData: Data
  participantData: Record<string, Data>
}

function read<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, T>
  } catch {
    return {}
  }
}

function write<T>(key: string, value: Record<string, T>) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable (private window): nothing is remembered.
  }
}

// One note per session (keyed as the seeded notes are: case number and
// session subject, stable across demo resets).
export const loadPointer = (sessionKey: string): NotePointer | null => read<NotePointer>(POINTERS)[sessionKey] ?? null

export const savePointer = (sessionKey: string, pointer: NotePointer) =>
  write(POINTERS, { ...read<NotePointer>(POINTERS), [sessionKey]: pointer })

const draftKey = (sessionKey: string, templateId: string) => `${sessionKey}|${templateId}`

export const loadDraft = (sessionKey: string, templateId: string): NoteDraft | null =>
  read<NoteDraft>(DRAFTS)[draftKey(sessionKey, templateId)] ?? null

export const saveDraft = (sessionKey: string, templateId: string, draft: NoteDraft) =>
  write(DRAFTS, { ...read<NoteDraft>(DRAFTS), [draftKey(sessionKey, templateId)]: draft })

export function clearDraft(sessionKey: string, templateId: string) {
  const drafts = read<NoteDraft>(DRAFTS)
  delete drafts[draftKey(sessionKey, templateId)]
  write(DRAFTS, drafts)
}

export function resetTemplateNotes() {
  try {
    localStorage.removeItem(POINTERS)
    localStorage.removeItem(DRAFTS)
  } catch {
    // Nothing to clear.
  }
}
