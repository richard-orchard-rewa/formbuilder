import type { SessionNote } from "./types"

// The practitioner using the portal, and her caseload. In the real system
// the session-notes system knows who's signed in and which cases are
// theirs; here it's fixed.
export const PRACTITIONER = { name: "Yvonne Carter", initials: "YC", role: "Practitioner" }

export const CASELOAD = ["104872", "104915", "104931", "104744"]

// Session notes already written, keyed `<case number>|<session subject>`.
// These hold only what a note captures itself: the narrative and
// assessment answers. Every data-bound value (attendance, setting, client
// details, ...) lives in ICIS and is read through the Data Binding Service
// when the note is opened -- the split between "form submission" and
// "data-bound data storage" (requirements §7).
export const SEEDED_NOTES: Record<string, SessionNote> = {
  "104872|Intake · Taylor Hawkins": {
    status: "submitted",
    savedAt: "Intake day, 10:15 am",
    savedBy: PRACTITIONER.name,
    answers: {
      "intake-assessment:00152096": {
        previous: "Yes",
        hypothesis:
          "Long-standing pattern of pursue–withdraw in conflict; Taylor carries most of the household's mental load since the second child and feels unheard.",
        focus: "Communication and conflict de-escalation; shared decision-making about finances.",
      },
      "presenting-needs:00152096": {
        main: "Family functioning",
        additional: ["Parenting", "Financial resilience"],
        notes: "Presents as motivated. Identified finances as the most frequent trigger for arguments.",
      },
      "outcome-scores:00152096": {
        circumstances: {
          "Family functioning": 2,
          "Mental health, wellbeing and self-care": 3,
          "Personal and family safety": 4,
          "Material wellbeing and basic necessities": 3,
        },
      },
      "safety:00152096": {
        concern: "No",
        notes: "MyDOORS responses reviewed; no current safety concerns identified.",
      },
      "next-session": {
        next: "Review Adam's intake, then agree joint goals for the couple sessions.",
        supervisor: "",
      },
    },
  },
  "104872|Intake · Adam Hawkins": {
    status: "draft",
    savedAt: "Intake day, 12:05 pm",
    savedBy: PRACTITIONER.name,
    answers: {
      "intake-assessment:00152097": {
        previous: "No",
        hypothesis: "",
        focus: "",
      },
      "presenting-needs:00152097": {
        main: "Family functioning",
        additional: ["Employment"],
        notes: "Recently changed roles; long hours. Keen to 'stop the fighting'.",
      },
    },
  },
  "104872|Session 2 · Taylor & Adam Hawkins": {
    status: "submitted",
    savedAt: "Last week, 11:40 am",
    savedBy: PRACTITIONER.name,
    answers: {
      "presenting-needs:00152096": {
        main: "Family functioning",
        additional: ["Parenting", "Financial resilience"],
        notes: "Reported one argument this week, resolved faster than usual.",
      },
      "presenting-needs:00152097": {
        main: "Family functioning",
        additional: ["Employment"],
        notes: "",
      },
      "session-focus": {
        focus: "Agreeing joint goals; introducing a time-out and repair structure for arguments.",
        content:
          "Mapped the conflict cycle together. Both identified money conversations late at night as the flashpoint. Practised the speaker–listener technique on a low-stakes topic. Homework: one scheduled 20-minute money check-in.",
      },
      "safety:00152096": { concern: "No", notes: "" },
      "safety:00152097": { concern: "No", notes: "" },
      "next-session": {
        next: "Debrief the money check-in. Start on repair attempts after conflict.",
        supervisor: "Guidance on balancing the two sets of individual goals in joint sessions.",
      },
    },
  },
  "104931|Session 5 · Daisy & Morgan Chen": {
    status: "submitted",
    savedAt: "Last week, 2:10 pm",
    savedBy: PRACTITIONER.name,
    answers: {
      "presenting-needs:00152099": {
        main: "Mental health, wellbeing and self care",
        additional: ["Community participation and networks"],
        notes: "Attended alone by phone; Morgan unwell.",
      },
      "session-focus": {
        focus: "Individual check-in with Daisy while Morgan was absent.",
        content: "Explored Daisy's support network and self-care routines. Agreed to resume joint sessions next week.",
      },
      "safety:00152099": { concern: "No", notes: "" },
      "next-session": {
        next: "Check in with Morgan about the missed session; resume joint work.",
        supervisor: "",
      },
    },
  },
  "104744|Session 7 · Samira Patel": {
    status: "submitted",
    savedAt: "Two weeks ago, 4:25 pm",
    savedBy: PRACTITIONER.name,
    answers: {
      "presenting-needs:00152101": {
        main: "Personal and family safety",
        additional: ["Post separation parenting"],
        notes: "Parenting orders finalised last month.",
      },
      "session-focus": {
        focus: "Adjusting to the new parenting arrangements.",
        content: "Worked through changeover-day stress; developed a short script for handovers.",
      },
      "safety:00152101": {
        concern: "No",
        notes: "Safety plan from earlier sessions reviewed; still current.",
      },
      "next-session": {
        next: "Case review: compare circumstances with intake PRE SCORE.",
        supervisor: "",
      },
    },
  },
}
