import type { BindingPresentation, BindingCommitResult, BoundValues } from "shared"

// What a module is about -- and so which record its bound fields read and
// write, and how often it appears on a session note:
// - `case`: once, about the case
// - `session`: once, about the booked session
// - `client`: once per client in the session (couples get two)
// - `participant`: once per client, about their part in *this*
//   session (their attendance)
export type ModuleScope = "case" | "session" | "client" | "participant"

// A field bound to a Data Binding Service binding. Everything about the
// control -- type, length, options, whether it's editable -- comes from the
// binding's descriptor; the module only picks a label and a presentation.
export interface BoundFieldDef {
  kind: "bound"
  id: string
  binding: string
  label?: string
  presentation?: BindingPresentation
}

// An ordinary field: captured in the session note only, never in ICIS.
export type NoteFieldDef =
  | { kind: "text"; id: string; label: string; placeholder?: string; required?: boolean }
  | { kind: "textarea"; id: string; label: string; placeholder?: string; required?: boolean }
  | { kind: "radio"; id: string; label: string; options: string[]; required?: boolean }
  | { kind: "checkboxes"; id: string; label: string; options: string[] }
  // A 1-5 rating per item (PRE / POST SCORE domains).
  | { kind: "scale"; id: string; label: string; items: string[] }

export type FieldDef = BoundFieldDef | NoteFieldDef

export interface ModuleDef {
  id: string
  title: string
  description: string
  scope: ModuleScope
  fields: FieldDef[]
}

// A session template: which modules a session of a given type is noted
// with, in order. Picked by the session's own `session.sessionType` value.
export interface SessionTemplate {
  id: string
  name: string
  // The session type option code this template is for.
  sessionType: string
  modules: string[]
}

// A note field's value: text, one choice, several choices, or ratings.
export type NoteValue = string | string[] | Record<string, number>

// One module instance's note answers, keyed by field ID.
export type ModuleAnswers = Record<string, NoteValue>

// Instance keys are the module ID, plus the client number for modules that
// repeat per client (`presenting-needs:00152096`). Client numbers rather
// than anchor IDs so the seeded notes line up across resets.
export interface SessionNote {
  status: "draft" | "submitted"
  savedAt: string
  savedBy: string
  answers: Record<string, ModuleAnswers>
  // Draft edits to bound values, not yet sent to ICIS (drafts never commit).
  pendingBound?: Record<string, BoundValues>
  // What was sent to the DBS at submit, and what happened to each value.
  committed?: Record<string, { values: BoundValues; results: Record<string, BindingCommitResult> }>
}
