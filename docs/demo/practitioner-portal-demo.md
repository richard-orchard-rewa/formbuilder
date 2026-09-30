# Demo: the practitioner portal — data-bound modules on cases, sessions and clients

A walkthrough for taking a developer through the [Data Binding Service proposal](../proposals/databound-fields.md) using a mocked-up practitioner portal. It shows data-bound fields where they'll actually live: in session notes built from modules, about a **case**, a **session**, and **each client** in it — not just a single client on a standalone form.

Everything runs on made-up data, against the **mock ICIS**, so it can be shown anywhere.

It complements the [data-bound fields demo](databound-fields-demo.md), which covers the binding creator and form-builder. This one covers the anchor model, multi-record session notes and the write path.

## What's running

```
 browser ──► practitioner portal (:5180)          stands in for the session-notes system
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
  - Narrative answers are stored in the browser, like a session-notes system storing its own submissions. Bound values are never stored there; they live in ICIS.
- **The Data Binding Service** now has four anchors — `client`, `case`, `session`, `sessionParticipant` — and a third write strategy, `choice`, for Dataverse option sets (attendance status, case stage).
- **The mock ICIS** now holds cases (`incident`), their clients (`csg_caseclient`), sessions (`wp_session`, regarding the case) and attendance (`csg_attendance`), with the same URL shapes, `$expand`, etags and privilege errors as Dataverse.

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
- **Portal notes:** **Reset portal notes** at the bottom of the portal's side rail puts the seeded notes back.

## The walkthrough

About 30 minutes, for a developer.

### 1. The model: anchors and strategies

**Point:** a binding is always *about* something. The anchor says what, and the DBS maps it to a store record.

1. Open http://localhost:3100. The service now lists four **anchors** and three **strategies**:

   | Anchor | Is, in ICIS | Found via |
   |---|---|---|
   | `client` | `contact` | `GET /anchors/client?clientNumber=` |
   | `case` | `incident` | `GET /anchors/case?caseNumber=`, then `GET /anchors/case/:id` for its clients and sessions |
   | `session` | `wp_session` (regarding the case) | the case's sessions; `GET /anchors/session/:id` for its case and participants |
   | `sessionParticipant` | `csg_attendance` (one per client per session) | the session's participants |

   | Strategy | Writes |
   |---|---|
   | `attribute` | One text column on the anchor's record |
   | `lookup` | One reference-table row, linked from the record (`@odata.bind`) |
   | `choice` *(new)* | One value of an option set on the record itself |

2. Open http://localhost:3100/bindings. Beside the client bindings are the new built-in ones: `case.caseNumber`, `case.program`, `case.location`, `case.referralSource`, `case.stage`, `session.subject`, `session.sessionType`, `session.setting` and `sessionParticipant.attendance`.
3. Show:
   - [`binding-service/src/dictionary.ts`](../../binding-service/src/dictionary.ts): the new bindings. The only ICIS-specific part of each is its `source`.
   - [`binding-service/src/allow-list.ts`](../../binding-service/src/allow-list.ts): `ANCHOR_ENTITIES`, and why the case, session and attendance allow-lists are still **empty**. Stewards can't create bindings there until a data owner approves the attributes, which has to weigh DEX timing.

### 2. Navigating by anchors

**Point:** the portal never asks ICIS for anything. It walks the DBS's anchor graph, and gets DBS IDs back.

1. Open the portal's **Home**. It shows today's sessions and the notes due, all from the DBS.
2. Open **DBS traffic**. For each case in the caseload there are three calls:
   - `GET /anchors/case?caseNumber=104872`, which returns the DBS's ID for the case.
   - `GET /anchors/case/:id`, which returns its clients and sessions as anchors.
   - `POST /resolve` with `{ anchor: { case } }`, for the program and stage shown on the page.
3. Expand one: every `id` is a DBS UUID, and `case.program` comes back as `couples-counselling`, an option code. In the mock's **API log**, the same page load shows `incidents?$filter=ticketnumber eq '104872'`, `csg_caseclients?…$expand=csg_contactid(…)` and `wp_sessions?$filter=_regardingobjectid_value eq …`. Only the DBS sees Dataverse's IDs.

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
   - **Client module** (Client details, Presenting needs, Safety), **once per client**, anchored on each client.
   - **Participant module** (Attendance), once per client, anchored on that client's attendance in *this* session.
4. The **Data binding** rail shows three records: *Case and session*, then *Taylor Hawkins* and *Adam Hawkins*, each person's client record together with their attendance. In **DBS traffic**, that's three resolves. Each multi-anchor request (`{ session, case }`, `{ sessionParticipant, client }`) is **one store read per anchor**. See `readGroups` in [`service.ts`](../../binding-service/src/service.ts).
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
5. In the mock's **API log**, look for the PATCHes: `wp_sessions(…)` (setting), `csg_attendances(…)` ×2 (attendance, sent as the option's integer `4`), and `contacts(…)` (preferred name). In **Cases → 104872 → Session 3**, both attendances say *Attended*, last modified by *Data Binding Service (demo)*.

### 6. The safety nets

1. **A conflict, per value.**
   - Click **Edit session note**, and change **Referral source** to *GP*.
   - In the mock, open **Cases → 104872**, set Referral Source to *Former Client* and **Save in ICIS**. That's reception changing it.
   - Submit. Referral source says **Not saved — changed in ICIS since the note was opened (ICIS now has "Former Client")**. Anything else changed in the same submit is still saved, and so is the note.
2. **Changed since submitted.** In the mock's Session 3, change the setting to *Telephone*. Reload the portal's note: it says *Changed in ICIS since this note was submitted (this note saved "Video Conference")*. It doesn't silently show the new value as if the note had said it (proposal, decision 1).
3. **The service account is the ceiling.** In the mock's **Service account**, untick **Activity · Write** (`prvWriteActivity`), save, then edit and resubmit the setting. It says **Not saved — ICIS refused the update: the Data Binding Service's account is missing prvWriteActivity privilege**.
   - Sessions are *activities*, so this one privilege is write on every activity type in the org. That's why an ICIS admin grants it with care, and a real talking point for the DBS's own account ([setup guide](../setup/icis-binding-service-account.md)).
   - Reads are protected the same way: untick *Case · Read*, and the portal's error names `prvReadIncident`, with Dataverse's principal IDs stripped.
4. **Anchors are typed.** A client's ID can't be used as a case's:

   ```bash
   curl -s -X POST localhost:3100/resolve -H "Content-Type: application/json" -d '{"anchor":{"case":"<a client anchor ID from DBS traffic>"},"bindings":["case.caseNumber"]}'
   ```

   It answers `404 No case …`. Naming a case binding without a case anchor is a `422`.

### 7. Code tour

| What | Where |
|---|---|
| The contract: anchors, multi-anchor `AnchorContext`, `choice`, the navigation schemas | [`shared/src/schemas/binding.ts`](../../shared/src/schemas/binding.ts) |
| Grouping by anchor; one read and one conditional write per record | `readGroups` / `commitGroup` in [`binding-service/src/service.ts`](../../binding-service/src/service.ts) |
| Case and session navigation, `$expand`, choice columns and option sets: the only ICIS-aware code | `readCase`, `readSession`, `choiceOptions` in [`binding-service/src/adapters/icis.ts`](../../binding-service/src/adapters/icis.ts) |
| Anchor IDs that know their kind | `storeIdForAnchor` in [`binding-service/src/identity.ts`](../../binding-service/src/identity.ts) |
| The mock's cases, sessions, attendance and seed | [`mock-icis/src/data.ts`](../../mock-icis/src/data.ts) |
| The adapter proven against the mock, case to attendance | [`mock-icis/src/contract.test.ts`](../../mock-icis/src/contract.test.ts) |
| Modules, scopes and templates | [`practitioner-portal/src/seed/modules.ts`](../../practitioner-portal/src/seed/modules.ts) |
| How a note becomes resolve/commit groups | [`practitioner-portal/src/session-note.ts`](../../practitioner-portal/src/session-note.ts) |
| A control rendered purely from its descriptor | [`practitioner-portal/src/components/BoundControl.tsx`](../../practitioner-portal/src/components/BoundControl.tsx) |

## Talking points

- **Modules are anchored, not forms.** The same *Client details* module appears twice on a couples note, once per client, each bound to a different ICIS record. The module never names a record; the session note supplies the anchors at fill time (requirements §7 and §9).
- **The session-notes system never holds an ICIS ID.** Cases, sessions, clients and attendance are all DBS anchors, and lists are option codes.
- **Adding an option-set type was one strategy,** not new code in forms. `choice` reads options from metadata and writes integers, and to the portal it's just another list.
- **One read per record, one conditional write per record.** A note that touches four records costs four PATCHes at most. A partial failure is reported per value, never as a failed note.

## Not shown yet

- **Modules from form-builder.** The portal's modules and templates are seeded in the portal. Wiring bound fields into form-builder's modules and session templates is US-L.4.
- **Presenting needs, referrals and safety concerns in ICIS.** Here they're note-only. They need the `set-membership` and `child-collection` strategies (US-L.8).
- **Stewards creating case, session or attendance bindings.** Those allow-lists are empty until a data owner approves them. DEX-reported columns need the timing rules first.
- **Real identity and an outbox** (US-L.2, US-L.1). The DBS writes as its service account, synchronously, on submit.
- **Session creation and booking.** The portal notes sessions that already exist in ICIS; it doesn't book them.
