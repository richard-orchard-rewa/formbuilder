# Demo: data-bound fields, end to end

A walkthrough to show people how data-bound fields work, from the developer who sets up the Data Binding Service to the practitioner whose edits land back in ICIS. It runs entirely on made-up data, against a **mock ICIS**, so it can be shown anywhere without touching a real environment or real client records.

Background: [the proposal](../proposals/databound-fields.md).

## What's running

```
 browser ──► form-builder (client :5173, server :3000)
                   │  HTTP only — never talks to ICIS
                   ▼
            Data Binding Service (:3100)     ← owns the dictionary, the allow-list,
                   │  Dataverse Web API          and every rule
                   ▼
            Mock ICIS (:3200)                ← stands in for Dynamics 365 / Dataverse
```

- **Mock ICIS** ([`mock-icis/`](../../mock-icis/)) is a stand-in for ICIS's Dataverse Web API.
  - It speaks exactly the subset of the protocol the service uses: metadata, contact reads and PATCHes, lookup lists and privilege checks. It uses the same URL shapes, etags and error messages as the real thing.
  - It holds 20 made-up clients shaped like ICIS `contact` records. Phone numbers are from ACMA's ranges reserved for fiction, and emails use `example.com`.
  - Its screens let you play ICIS staff (edit clients), the ICIS admin (grant the service's privileges) and an observer (watch every API call).
- **The Data Binding Service runs unchanged.** It uses its real ICIS adapter, pointed at the mock by [`binding-service/.env.demo`](../../binding-service/.env.demo). The only differences from real ICIS are a fixed token instead of an Entra sign-in (refused for anything but localhost) and privileges re-checked on every request. A contract test ([`mock-icis/src/contract.test.ts`](../../mock-icis/src/contract.test.ts)) runs the real adapter against the mock, so the two can't drift apart silently.

## Before the demo

You'll need Docker Desktop running (for form-builder's Postgres).

```bash
docker compose up -d
npm run db:migrate -w server
npm run demo
```

`npm run demo` starts all four processes. Open, in separate tabs:

| Tab | URL | Who uses it |
|---|---|---|
| form-builder | http://localhost:5173 | Data steward, form admin, practitioner |
| Mock ICIS | http://localhost:3200 | ICIS admin, ICIS staff, observer |
| Data Binding Service | http://localhost:3100 | Developer |

To start from a clean slate:
- **Mock ICIS:** click **Reset demo** in its header. That restores clients and privileges and clears the log. Restarting it does the same.
- **Bindings the steward created:** `npm run demo:reset`.
- **Forms built in a previous run:** these stay in Postgres. Create a new form each time, or reuse one.

It helps to leave the mock's **API log** open on a second screen throughout. The point *everything goes through an API* makes itself.

## The walkthrough

About 20 minutes. Each part is one role.

### 1. Developer: stand up the service

**Point:** developers build the Data Binding Service and its rules once. They don't build each field.

1. Open http://localhost:3100. The service describes itself: what it's for, its anchor (`client`), its two write strategies (`attribute`, `lookup`), and every endpoint.
2. Open http://localhost:3100/bindings. These are the four built-in bindings, as the descriptors a form renders from. Each gives a label, whether it's editable, and its control: text with a length limit, or a lookup.
3. Show three files:
   - [`binding-service/src/allow-list.ts`](../../binding-service/src/allow-list.ts): the 12 client attributes a steward may ever bind. The comment lists what's deliberately left out.
   - [`binding-service/src/adapters/icis.ts`](../../binding-service/src/adapters/icis.ts): the only code that knows ICIS column names or OData. Replacing ICIS means replacing this file, not changing forms.
   - [`binding-service/.env.demo`](../../binding-service/.env.demo): how the service is pointed at an ICIS. For real ICIS it's an app registration ([setup guide](../setup/icis-binding-service-account.md)).

### 2. ICIS admin: the service's account is the ceiling

**Point:** the service can't offer more than its own ICIS account is allowed to do, and that's decided in ICIS, not in form-builder.

1. In the mock, open **Service account**. The account starts as the real test account does: it can read clients and titles, and nothing more.
2. In form-builder, open **Data bindings**. The banner says the service's account can't write client records, so every attribute is **Display only**. Gender and Home language each say the account can't read their list.
3. Back in the mock's **Service account**, tick:
   - Contact: **Write** and **Append**
   - Salutation: **Append To**, so the built-in Title can be saved as well as read
   - Gender: **Read** and **Append To**

   Then click **Save role**.
4. Refresh **Data bindings**. Most attributes are now **Editable**, and Gender's problem has gone. Home language is still blocked, because its list is still unreadable. Leave it that way to show the rule.

### 3. Data steward: create fields without a developer

**Point:** new data-bound fields are configuration. The steward picks from approved attributes, and ICIS's own metadata fixes the type and limits.

1. In **Data bindings**, under **Create a binding**, find **Preferred Name** (`csg_alias`) and click **Create binding**.
   - The key is suggested: `client.preferredName`.
   - The type and 100-character limit come from ICIS: "From ICIS: Text, up to 100".
   - Set the label to *Preferred name* and narrow the maximum length to **60**. The field won't go above 100: a binding can only narrow what ICIS allows. The service enforces this too, not just the page.
   - Keep **Editable**, then click **Save draft**.
2. Click **Publish v1** on the new row.
3. Create **Gender** (`csg_genderid`) the same way. It's a dropdown whose options come from ICIS. Publish it.
4. *Optional:* create **Home Language** and try to publish it. It's refused, with the reason. The steward can't work around the ICIS admin.
5. Show the mock's **Clients**, then open any client. The record also holds a DSS client ID, a health-care card number and a portal password hash, but none of them appear in **Data bindings**. The allow-list is the security boundary.

### 4. Form admin: build a form from data-bound fields

**Point:** to the form admin, a data-bound field is just another field. They can't change what it's bound to.

1. From **Forms**, create a form, e.g. *Intake — client details*, then click **Build**.
2. From the palette's **Data bound · Client** section, drag on **Title**, **First name**, **Last name**, **Preferred name**, **Gender** and **Client number**. Also add one ordinary custom field from **Field types**, such as a text area called *Reason for contact*, to show they mix.
3. Select **Gender**. The inspector shows what it's bound to and that its options come from the source system. Select **Client number**: *Required* is disabled, because a display-only value can't be required.
4. Click **Publish**.

### 5. Practitioner: fill in the form, and it saves back to ICIS

**Point:** the practitioner sees the client's current values, edits them in place, and the changes land in ICIS, through the service only.

1. From **Forms**, click **Fill out** on the new form. Load client number **00152078** (Minh Tran).
   - Every bound field is pre-filled from ICIS. Preferred name shows *Tony*.
   - Client number can't be edited.
2. Change **Preferred name** to *Tony T*. Fill in the custom field, then click **Submit**.
3. The result lists each bound field. Preferred name says **Saved to ICIS**; the others say **Unchanged**.
4. In the mock, open **Clients** and then Minh Tran. The preferred name is *Tony T*, last modified by *Data Binding Service (demo)*. In the **API log**, look for the `PATCH contacts(…)` with status 204.

### 6. The safety nets

**Point:** it won't silently overwrite someone else's change, and it won't do what it's not allowed to.

1. **A conflict.**
   - Fill the form for Minh Tran again, and leave it open.
   - In the mock, edit Minh Tran's preferred name to *Anthony* and click **Save in ICIS**. That's a receptionist changing it in ICIS.
   - Back in the form, change the preferred name to something else and submit. The result says **Not saved — changed in ICIS since the form was opened (ICIS now has "Anthony")**. The submission itself is still recorded; only the stale write is refused.
2. **The ceiling, at save time.**
   - In the mock's **Service account**, untick Contact **Write**.
   - Fill the form for another client, e.g. **00152080**, change a name, and submit. The result says **Not saved — ICIS refused the update: the Data Binding Service's account is missing prvWriteContact privilege**.
   - In **Data bindings**, every attribute is back to display-only.
3. **Validation at the boundary.** The service re-checks length limits itself, so the rule holds even for a caller that skips the form's own checks.

## Talking points

- **Nobody talks to ICIS but the service.** form-builder only knows logical keys like `client.preferredName`. The API log proves it: form-builder never appears there.
- **Three roles, three kinds of change.**
  - Developers write strategies, the adapter and the allow-list: rarely, and in code review.
  - Stewards create bindings as configuration: whenever needed, with no developer.
  - Form admins use bindings like any other field.
- **The limits come from ICIS itself,** not from anyone's memory of it. A binding can only narrow them, and a form can only use them.
- **The rules sit where they can't be bypassed:** in the service, re-checked at publish time and at save time.
- **What isn't shown yet:**
  - Linked data, i.e. presenting needs and referrals, which need two more strategies.
  - The validation library (phone, email, Medicare).
  - Real identity. The service uses a service account, which §8 of the requirements rules out for real clinical writes.
  - Bound fields in modules and session templates.
