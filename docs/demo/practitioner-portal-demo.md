# Demo: the practitioner portal — data-bound modules on cases, sessions and clients

A walkthrough for taking a developer through the [Data Binding Service proposal](../proposals/databound-fields.md) using a mocked-up practitioner portal. It shows data-bound fields where they'll actually live: in session notes built from modules, about a **case**, a **session**, and **each client** in it — not just a single client on a standalone form.

Everything runs on made-up data, against the **mock ICIS**, so it can be shown anywhere.

It complements the [data-bound fields demo](databound-fields-demo.md), which covers the binding creator and form-builder. This one covers the anchor model, multi-record session notes and the write path.

## What's running

```
 browser ──► practitioner portal (:5180)          stands in for the session-notes system
                   │  /api/notes ──► Postgres (practitioner_portal_demo): the notes themselves
                   │  /dbs relay — HTTP only, never ICIS
                   ▼
            Data Binding Service (:3100)          anchors, dictionary, rules, identities
                   │  Dataverse Web API
                   ▼
            Mock ICIS (:3200)                     contacts, cases, sessions, attendance

 form-builder (client :5173, server :3000) runs alongside, for its Data bindings page.
```

- **The portal** ([`practitioner-portal/`](../../practitioner-portal/)) is a Vite + React mock of the RAWA practitioner portal concept (`designs-practitioner`): home, caseload, case view and session notes.
  - Its session notes are assembled from **modules**, each scoped to a case, a session, a client or a client's attendance. The modules and templates are seeded in [`src/seed/modules.ts`](../../practitioner-portal/src/seed/modules.ts). They stand in for form-builder's modules and session templates until those support bound fields (US-L.4).
  - It holds **no ICIS IDs**: only DBS-issued anchor IDs and option codes.
  - Session notes are saved to the portal's **own Postgres database** (`practitioner_portal_demo`, table `session_notes`) through `/api/notes`, served by the portal's dev server ([`server/notes-api.ts`](../../practitioner-portal/server/notes-api.ts)). It's created on first use, on the same local Postgres as the others but never their databases. Set `PORTAL_DATABASE_URL` to point it elsewhere.
  - A note holds the narrative answers, plus a record of what it sent to ICIS and what came back. Bound values themselves live in ICIS.
  - **Submitting is transactional, and safe on a flaky connection.** The browser sends one request (`POST /api/notes/<key>/submit`) holding the note and its ICIS changes, under a submit ID picked when the note was opened. The server stores the note and one outbox row per ICIS record (`icis_outbox`) in a single Postgres transaction: both or neither. A resend with the same ID (after a dropped connection) is recognised in `note_submits` and never stored twice.
  - The server, not the browser, then sends the outbox to the DBS, retrying with back-off until each record is answered. It resumes after a restart. The practitioner sees **Saved** once it's all through, or **Saved, sending to ICIS** (with why it hasn't landed yet) while it isn't. The page follows along until it's done.
  - To show ICIS being unreachable, start the portal with `BINDING_SERVICE_URL` pointing nowhere (the `practitioner-portal-no-dbs` entry in `.claude/launch.json`, on :5182). Submit, then restart it normally, and the waiting change goes through by itself.
  - Not yet: ICIS changes for different records are still sent one record at a time, not as a single Dataverse `$batch` transaction (US-X.10).
- **The Data Binding Service** uses the session and participant anchors from the proposal's "Anchors beyond the client" (PR #83), plus a prototype `case` anchor built for this demo. Each resolve and commit is about **exactly one** anchor. Option sets (attendance status, case stage) use the `choice` strategy.
- **The mock ICIS** now holds cases (`incident`), their clients (`csg_caseclient`), sessions (`wp_session`, regarding the case) and attendance (`csg_attendance`), with the same URL shapes, filters, etags and privilege errors as Dataverse.

## Before the demo

You'll need Docker Desktop running (for Postgres).

```bash
docker compose up -d
npm run db:migrate -w server
npm run demo:portal
```

`npm run demo:portal` creates and migrates the DBS's demo database, starts all five processes, then runs the **seed** (below). Open:

| Tab | URL | Who uses it |
|---|---|---|
| Practitioner portal | http://localhost:5180 | Practitioner (and the developer panel) |
| Mock ICIS | http://localhost:3200 | ICIS admin, ICIS staff, observer |
| Data Binding Service | http://localhost:3100 | Developer |
| form-builder | http://localhost:5173 | Data steward (Data bindings page) |

To see a submitted note in Postgres: `docker compose exec db psql -U formbuilder -d practitioner_portal_demo -c "select note_key, status, icis_state, committed from session_notes" -c "select submit_id, group_id, status, attempts, last_error from icis_outbox"`.

Leave the mock's **API log** open on a second screen. In the portal, open **DBS traffic** (bottom right). Between them you see both hops: portal → DBS, and DBS → ICIS.

### What the seed does

[`practitioner-portal/scripts/seed-demo.ts`](../../practitioner-portal/scripts/seed-demo.ts) sets the demo up the way people would, through the real screens and APIs, so every rule still applies:

1. **As the ICIS admin**, it clicks the mock's *Grant what the practitioner portal demo needs*. This gives the service account read on cases, sessions, attendance and their lists, and write where the portal edits. Home language stays unreadable, as in the other demo.
2. **As a data steward**, it creates and publishes four client bindings through the DBS's creator API (`POST /admin/bindings`, then publish): `client.preferredName`, `client.gender`, `client.mobilePhone` and `client.email`. The DBS checks each against the allow-list, ICIS's metadata and its own privileges.

It's safe to run again (`npm run demo:seed`).

### The seeded caseload

The practitioner is Yvonne Carter. Session dates are **relative to the day the mock starts**, so "today" is always today.

| Case | Clients | Program · stage | Sessions (and seeded notes) |
|---|---|---|---|
| **104872** | Taylor Hawkins (primary), Adam Hawkins | Couples Counselling · Service delivery | Intake · Taylor (note submitted), Intake · Adam (**draft**), Session 2 (submitted), **Session 3 — today 10:30**, Session 4 (next week) |
| 104915 | Nadia Williams | Individual Counselling · Intake | **Intake — today 9:00** |
| 104931 | Daisy Chen, Morgan Chen | Couples Counselling · Service delivery | Session 5 (submitted; Morgan *Did Not Attend*), **Session 6 — today 13:00** |
| 104744 | Samira Patel | Individual Counselling · Case review | Session 7 (submitted), **Case review — today 15:30** |

The clients are `00152096`–`00152101` in the mock's **Clients**, alongside the 20 from the other demo.

### Resetting

- **Mock ICIS:** **Reset demo** in its header restores every record and the read-only privileges. Run `npm run demo:seed` again afterwards.
- **The DBS's bindings, anchor IDs and option codes:** `npm run demo:reset` empties its demo database. Run the seed again afterwards.
- **Portal notes:** **Reset portal notes** at the bottom of the portal's side rail empties `session_notes`, which puts the seeded notes back.

## The walkthrough

About 30 minutes, for a developer.

### 1. The model: anchors and strategies

**Point:** a binding is always *about* something. The anchor says what, and the DBS maps it to a store record.

1. Open http://localhost:3100. The service now lists four **anchors** and three **strategies**:

   | Anchor | Is, in ICIS | Found via |
   |---|---|---|
   | `client` | `contact` | `GET /anchors/client?clientNumber=` |
   | `case` *(prototype)* | `incident` | `GET /anchors/case?caseNumber=`: the case, its clients, and every session regarding it with each one's participants |
   | `session` | `wp_session` (regarding the case) | a case's sessions, or `GET /anchors/sessions?clientNumber=` |
   | `participant` | `csg_attendance` (one person at one session) | each session's participants |

   | Strategy | Writes |
   |---|---|
   | `attribute` | One text column on the anchor's record |
   | `lookup` | One reference-table row, linked from the record (`@odata.bind`) |
   | `choice` | One value of an option set on the record itself |

2. Open http://localhost:3100/bindings. Beside the client bindings are the new built-in ones: `case.caseNumber`, `case.program`, `case.location`, `case.referralSource`, `case.stage`, `session.sessionType` and `session.setting`. They sit beside main's `session.subject`, `session.start`, `session.end` and `participant.attendance`.
3. Show:
   - [`binding-service/src/dictionary.ts`](../../binding-service/src/dictionary.ts): the new bindings. The only ICIS-specific part of each is its `source`.
   - [`binding-service/src/allow-list.ts`](../../binding-service/src/allow-list.ts): `ANCHOR_ENTITIES`, and why the case, session and attendance allow-lists are still **empty**. Stewards can't create bindings there until a data owner approves the attributes, which has to weigh DEX timing.

### 2. Navigating by anchors

**Point:** the portal never asks ICIS for anything. It walks the DBS's anchor graph, and gets DBS IDs back.

1. Open the portal's **Home**. It shows today's sessions and the notes due, all from the DBS.
2. Open **DBS traffic**. For each case in the caseload there are two calls:
   - `GET /anchors/case?caseNumber=104872`, which returns the DBS's ID for the case, its clients, and every session regarding it with each session's participants.
   - `POST /resolve` with `{ anchor: { case } }`, for the program and stage shown on the page.
3. Expand one: every `id` is a DBS UUID, and `case.program` comes back as `couples-counselling`, an option code. In the mock's **API log**, the same page load shows filtered reads: `incidents?$filter=ticketnumber eq '104872'`, `csg_caseclients?…`, `wp_sessions?$filter=_regardingobjectid_value eq …`, then the sessions' attendances and the attendees' contacts. Only the DBS sees Dataverse's IDs.

### 3. The case view

1. Open **Cases**, then **Taylor Hawkins & Adam Hawkins**.
2. The case bar (program, location, stage, referral source) is one resolve against the `case` anchor. Labels come from each binding's options, fetched from the `options.href` its descriptor gives. The portal doesn't know the DBS's URL conventions.
3. Open **Case participants**. Each client's record is a resolve against their own `client` anchor, using built-in bindings and the four the seed published.

### 4. A session note: modules on three kinds of record

**Point:** one session note reads from, and writes to, several ICIS records. The modules say which.

1. Open **Session 3 · Taylor & Adam Hawkins**, from Home or the Sessions tab.
2. The header says **Counselling session note**. The template was picked by the session's own `session.sessionType` value. Open Nadia's intake or Samira's case review to see the other two templates.
3. Each module is badged with its scope:
   - **Session module** (Session details), once, anchored on the session.
   - **Case module** (Case details, Issues for next session), once, anchored on the case.
   - **Client module** (Client details, Presenting needs, Safety), **once per participant**, anchored on that participant's client record.
   - **Participant module** (Attendance), once per client, anchored on that client's attendance in *this* session.
4. The **Data binding** rail shows six records: *Session*, *Case*, and for each of Taylor and Adam their *attendance* and their *client record*. In **DBS traffic**, that's six resolves, each on exactly one anchor (`{ session }`, `{ case }`, `{ participant }`, `{ client }`) and each one store read. A binding asked for on the wrong anchor is refused (`AnchorMismatchError` in [`service.ts`](../../binding-service/src/service.ts)).
5. In the developer panel, tick **Show binding keys on fields**. Every bound field shows its key, version, strategy and access.
6. Mixed on the same module: *Session details* has three bound fields and one ordinary field (Duration). Ordinary fields stay in the note; they're never sent to ICIS.
7. **Previous session summary** comes from Session 2's note, which the portal holds, not ICIS.

### 5. Save back to ICIS

**Point:** on submit, the note is saved first, then only the changed bound values go to the DBS, one commit per record group.

1. Change:
   - **Session setting** to *Video Conference*
   - both **Attendance** values to *Attended*
   - Adam's **Preferred name** to *AJ*

   Each shows *Changed — saved to ICIS when the note is submitted*. The rail counts the changes per record.
2. **Save as draft**. The notice says drafts never write to ICIS. Reload: the draft edits are still there, and ICIS is unchanged.
3. Fill in the required fields (presenting needs, focus and content, safety, issues for next session), then **Submit session note**.
4. **What happened in ICIS** lists each value: *Saved to ICIS*.
5. In the mock's **API log**, look for the PATCHes: `wp_sessions(…)` (setting), `csg_attendances(…)` ×2 (attendance, sent as the option's integer `4`), and `contacts(…)` (preferred name). In the mock's **Cases → 104872**, Session 3's setting is *Video Conference* and both attendances say *Attended*. The **Sessions** page shows who last modified each attendance: *Data Binding Service (demo)*.

### 6. The safety nets

1. **A conflict, per value.**
   - Click **Edit session note**, and change **Referral source** to *GP*.
   - In the mock, open **Cases → 104872**, set Referral Source to *Former Client* and **Save in ICIS**. That's reception changing it.
   - Submit. Referral source says **Not saved — changed in ICIS since the note was opened (ICIS now has "Former Client")**. Anything else changed in the same submit is still saved, and so is the note.
2. **Changed since submitted.** In the mock's **Cases → 104872**, change Session 3's setting to *Telephone*. Reload the portal's note: it says *Changed in ICIS since this note was submitted (this note saved "Video Conference")*. It doesn't silently show the new value as if the note had said it (proposal, decision 1).
3. **The service account is the ceiling.** In the mock's **Service account**, untick **Session · Write** (`prvWritewp_session`), save, then edit and resubmit the setting. It says **Not saved — ICIS refused the update: the Data Binding Service's account is missing prvWritewp_session privilege**.
   - Reads are protected the same way: untick *Case · Read*, and the portal's error names `prvReadIncident`, with Dataverse's principal IDs stripped.
4. **Anchors are typed.** A client's ID can't be used as a case's:

   ```bash
   curl -s -X POST localhost:3100/resolve -H "Content-Type: application/json" -d '{"anchor":{"case":"<a client anchor ID from DBS traffic>"},"bindings":["case.caseNumber"]}'
   ```

   It answers `404 No case …`. Asking for a case binding on a client anchor is a `400`.

### 7. Code tour

| What | Where |
|---|---|
| The contract: anchors, one-anchor `AnchorContext`, `choice`, `CaseContext` | [`shared/src/schemas/binding.ts`](../../shared/src/schemas/binding.ts) |
| One anchor per call; one read and one conditional write per record; opening a case | `readAnchor`, `commit`, `findCase` in [`binding-service/src/service.ts`](../../binding-service/src/service.ts) |
| Case and session navigation, choice columns and option sets: the only ICIS-aware code | `findCaseByNumber`, `withParticipants`, `choiceOptions` in [`binding-service/src/adapters/icis.ts`](../../binding-service/src/adapters/icis.ts) |
| Anchor IDs that know their kind | `storeIdForAnchor` in [`binding-service/src/identity.ts`](../../binding-service/src/identity.ts) |
| The mock's cases, sessions, attendance and seed | [`mock-icis/src/data.ts`](../../mock-icis/src/data.ts) |
| The adapter proven against the mock, case to attendance | [`mock-icis/src/contract.test.ts`](../../mock-icis/src/contract.test.ts) |
| Modules, scopes and templates | [`practitioner-portal/src/seed/modules.ts`](../../practitioner-portal/src/seed/modules.ts) |
| How a note becomes resolve/commit groups | [`practitioner-portal/src/session-note.ts`](../../practitioner-portal/src/session-note.ts) |
| A control rendered purely from its descriptor | [`practitioner-portal/src/components/BoundControl.tsx`](../../practitioner-portal/src/components/BoundControl.tsx) |

## Talking points

- **Modules are anchored, not forms.** The same *Client details* module appears twice on a couples note, once per client, each bound to a different ICIS record. The module never names a record; the session note supplies the anchors at fill time (requirements §7 and §9).
- **The session-notes system never holds an ICIS ID.** Cases, sessions, clients and attendance are all DBS anchors, and lists are option codes.
- **An option set is just another strategy,** not new code in forms. `choice` reads options from metadata and writes integers, and to the portal it's just another list.
- **One read per record, one conditional write per record.** A couples note touches up to six records (session, case, and each person's attendance and client record), so at most six PATCHes. A partial failure is reported per value, never as a failed note.

## Not shown yet

- **Modules from form-builder.** form-builder's modules and session templates already take session- and participant-scoped bound fields (PR #83), but not case scope yet. The portal seeds its own modules and templates so it can show all four scopes; rendering form-builder's published templates is the natural next step.
- **Presenting needs, referrals and safety concerns in ICIS.** Here they're note-only. They need the `set-membership` and `child-collection` strategies (US-L.8).
- **Stewards creating case, session or attendance bindings.** Those allow-lists are empty until a data owner approves them. DEX-reported columns need the timing rules first.
- **Real identity and an outbox** (US-L.2, US-L.1). The DBS writes as its service account, synchronously, on submit.
- **Session creation and booking.** The portal notes sessions that already exist in ICIS; it doesn't book them.
