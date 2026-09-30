import type { ModuleDef, SessionTemplate } from "./types"

// The module library a session note is assembled from. A stand-in for
// form-builder's published modules and session templates
// (docs/proposals/modules-and-session-templates.md): seeded here so the
// portal can show case-, session-, participant- and client-anchored
// modules, with bound and ordinary fields side by side. form-builder's
// modules take session and participant bindings (PR #83), but not case
// scope yet.

const MAIN_REASONS = [
  "Family functioning",
  "Housing",
  "Mental health, wellbeing and self care",
  "Personal and family safety",
  "Physical health",
  "Trauma",
]

const ADDITIONAL_REASONS = [
  "Family separation",
  "Financial resilience",
  "Parenting",
  "Post separation parenting",
  "Employment",
  "Community participation and networks",
]

const CIRCUMSTANCES = [
  "Family functioning",
  "Mental health, wellbeing and self-care",
  "Personal and family safety",
  "Material wellbeing and basic necessities",
]

export const MODULES: ModuleDef[] = [
  {
    id: "session-details",
    title: "Session details",
    description: "Confirm the booking and how the session was delivered.",
    scope: "session",
    fields: [
      { kind: "bound", id: "subject", binding: "session.subject" },
      { kind: "bound", id: "type", binding: "session.sessionType" },
      { kind: "bound", id: "setting", binding: "session.setting", presentation: "radio" },
      { kind: "text", id: "duration", label: "Duration (minutes)", placeholder: "e.g. 60" },
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    description: "Record whether each booked client attended.",
    scope: "participant",
    fields: [
      { kind: "bound", id: "attendance", binding: "participant.attendance", presentation: "radio" },
    ],
  },
  {
    id: "case-details",
    title: "Case details",
    description: "The case this session belongs to. Keep its referral source and stage current.",
    scope: "case",
    fields: [
      { kind: "bound", id: "caseNumber", binding: "case.caseNumber" },
      { kind: "bound", id: "program", binding: "case.program" },
      { kind: "bound", id: "location", binding: "case.location" },
      { kind: "bound", id: "referralSource", binding: "case.referralSource" },
      { kind: "bound", id: "stage", binding: "case.stage", presentation: "dropdown" },
    ],
  },
  {
    id: "client-details",
    title: "Client details",
    description: "Check the client's details with them. Changes are saved to ICIS when the note is submitted.",
    scope: "client",
    fields: [
      { kind: "bound", id: "clientNumber", binding: "client.clientNumber" },
      { kind: "bound", id: "title", binding: "client.title", presentation: "dropdown" },
      { kind: "bound", id: "firstName", binding: "client.firstName" },
      { kind: "bound", id: "lastName", binding: "client.lastName" },
      // Configured bindings: a data steward creates these in the Data
      // bindings page (the demo's seed script does it for you).
      { kind: "bound", id: "preferredName", binding: "client.preferredName" },
      { kind: "bound", id: "gender", binding: "client.gender" },
      { kind: "bound", id: "mobile", binding: "client.mobilePhone" },
      { kind: "bound", id: "email", binding: "client.email" },
    ],
  },
  {
    id: "presenting-needs",
    title: "Client presenting needs",
    description: "The client's reasons for seeking assistance this session. Carried forward to the next session.",
    scope: "client",
    fields: [
      { kind: "radio", id: "main", label: "Main reason for seeking assistance", options: MAIN_REASONS, required: true },
      { kind: "checkboxes", id: "additional", label: "Additional reasons", options: ADDITIONAL_REASONS },
      { kind: "textarea", id: "notes", label: "Practitioner observations and context" },
    ],
  },
  {
    id: "intake-assessment",
    title: "Intake assessment",
    description: "Previous counselling, the practitioner's hypothesis and the proposed focus of intervention.",
    scope: "client",
    fields: [
      { kind: "radio", id: "previous", label: "Has the client had counselling before?", options: ["Yes", "No"] },
      { kind: "textarea", id: "hypothesis", label: "Hypothesis about client issues" },
      { kind: "textarea", id: "focus", label: "Focus of intervention", required: true },
    ],
  },
  {
    id: "outcome-scores",
    title: "Client circumstances (SCORE)",
    description: "Rate each circumstance domain from 1 (very poor) to 5 (very good).",
    scope: "client",
    fields: [{ kind: "scale", id: "circumstances", label: "Client circumstances", items: CIRCUMSTANCES }],
  },
  {
    id: "session-focus",
    title: "Focus, content and interventions",
    description: "The clinically relevant account of this session. Stays in the session note.",
    scope: "session",
    fields: [
      { kind: "textarea", id: "focus", label: "Focus of this session", required: true },
      { kind: "textarea", id: "content", label: "Content, process and interventions", required: true },
    ],
  },
  {
    id: "safety",
    title: "Safety concerns",
    description: "Children, suicide, domestic violence or other serious concerns, per client.",
    scope: "client",
    fields: [
      { kind: "radio", id: "concern", label: "Are there any client safety concerns?", options: ["Yes", "No"], required: true },
      { kind: "textarea", id: "notes", label: "Practitioner observations and context" },
    ],
  },
  {
    id: "case-review",
    title: "Case review",
    description: "Progress against the goals set at intake, and the plan for remaining sessions.",
    scope: "case",
    fields: [
      { kind: "textarea", id: "progress", label: "Interventions and progress", required: true },
      { kind: "textarea", id: "plan", label: "Plan for remaining sessions" },
    ],
  },
  {
    id: "next-session",
    title: "Issues for next session and supervision",
    description: "Carried into the next session's summary, and to the case's Issues for supervisor.",
    scope: "case",
    fields: [
      { kind: "textarea", id: "next", label: "Issues to raise at the next session", required: true },
      { kind: "textarea", id: "supervisor", label: "Issues to raise with a supervisor" },
    ],
  },
]

export const TEMPLATES: SessionTemplate[] = [
  {
    id: "intake",
    name: "Intake assessment",
    sessionType: "intake",
    modules: [
      "session-details", "attendance", "client-details", "case-details", "intake-assessment",
      "presenting-needs", "outcome-scores", "safety", "next-session",
    ],
  },
  {
    id: "counselling",
    name: "Counselling session note",
    sessionType: "counselling-session",
    modules: [
      "session-details", "attendance", "case-details", "presenting-needs", "session-focus",
      "safety", "client-details", "next-session",
    ],
  },
  {
    id: "case-review",
    name: "Case review",
    sessionType: "case-review",
    modules: ["session-details", "attendance", "case-details", "case-review", "outcome-scores", "next-session"],
  },
]

export const moduleById = (id: string) => MODULES.find((m) => m.id === id)!

export const templateFor = (sessionType: string | null | undefined) =>
  TEMPLATES.find((t) => t.sessionType === sessionType) ?? TEMPLATES[1]
