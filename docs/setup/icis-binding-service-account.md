# Setting up a read-only ICIS account for the Data Binding Service

## Status

Setup guide for the Data Binding Service (DBS) prototype ([proposal](../proposals/databound-fields.md)). These steps haven't been run yet; see "Things to check" at the end.

## Why

The DBS (`binding-service/`) is the only part of form-builder that talks to ICIS (Dynamics 365 / Dataverse). For now it signs in with the `feedback` app's test app registration (`rawa-feedback-stg`), borrowed by agreement. Two things are wrong with that:

- **It breaks the standalone rule.** form-builder must never share anything with `feedback` ([CLAUDE.md](../../CLAUDE.md)), and that includes its identity.
- **It's the wrong shape for the DBS.** That account can read contacts but not write them, and it can't read any of the reference tables behind contact lookups (salutation, gender, language, …). So Title falls back to a hard-coded list and no new lookup binding can be published.

The DBS treats its own ICIS account as a ceiling. It checks its privileges live, and no binding can offer more than that account is allowed to do ([guardrail 2](../proposals/databound-fields.md#guardrails)). A dedicated account, granted exactly what the DBS needs, turns that ceiling into a deliberate decision instead of an accident of whichever account was borrowed.

This guide creates a **read-only** account. Bindings stay display-only, which is the right starting point. Step 5 covers adding write access later.

## Who needs to do this

| Step | Where | Role needed |
|---|---|---|
| 1 | Entra admin centre | Application Developer, Cloud Application Administrator, or equivalent |
| 2–3 | Power Platform admin centre, ICIS **test** environment | System Administrator on that environment |
| 4 | This repo | Anyone running the DBS locally |

## 1. Register an app in Entra ID

1. Go to **Entra admin centre → App registrations → New registration**.
   - **Name:** `rawa-data-binding-service-stg`
   - **Supported account types:** accounts in this organisational directory only (single tenant)
   - **Redirect URI:** none. The DBS signs in as itself (client credentials); no user ever signs in through this registration.
2. On the new registration's **Overview**, note the **Application (client) ID**. The **Directory (tenant) ID** is the same RAWA tenant already in use.
3. Go to **Certificates & secrets → New client secret**. Give it a description and an expiry, then **copy the secret value immediately**; it's shown only once.
   - This is fine for the prototype. For anything longer-lived, use a certificate, or a secret held in Key Vault, and record who renews it and when.
4. **Don't add any API permissions.** Dataverse access comes from the security role in step 2, not from Entra consent. An app registration with no API permissions can still get a Dataverse token; what it can do there is decided entirely by its security role.

## 2. Create a read-only security role

In **Power Platform admin centre**, open the ICIS **test** environment, then **Settings → Users + permissions → Security roles → New role**.

- **Name:** `Data Binding Service – Read`
- **Business unit:** the root business unit

Grant only the privileges below and leave everything else at *None*:

| Table | Logical name | Privilege | Access level | Why the DBS needs it |
|---|---|---|---|---|
| Contact | `contact` | Read | Organization | Resolve a client's bound values, and find a client by client number across all sites |
| Salutation | `csg_salutation` | Read | Organization | Title options served live instead of the hard-coded fallback |
| Gender | `csg_gender` | Read | Organization | Lets a Gender lookup binding be published |
| Language | `csg_language` | Read | Organization | Lets a Home language lookup binding be published |
| User | `systemuser` | Read | User (lowest level) | Lets the DBS check its own privileges (`RetrieveUserPrivileges`) |

Notes:
- The `csg_` tables are on the **Custom Entities** tab in the classic role editor. In the new editor, search for them by display name.
- **Leave Write, Create, Delete, Append, Append To, Assign and Share off everywhere.** Without Write on Contact, the DBS caps every binding at display-only and says why on the Data bindings page. That's intended.
- **Don't copy an existing role** or add a broad one "to get it working". Existing roles grant far more than the DBS needs, and whatever the account can do becomes what bindings can do.
- If more lookup attributes are added to the DBS allow-list later (`binding-service/src/allow-list.ts`), each one's reference table needs Read added here too. Otherwise its binding can't be published. That's how it should work.

## 3. Add the application user

Still in the environment's **Settings → Users + permissions**:

1. Go to **Application users → New app user**.
2. **Add an app:** select `rawa-data-binding-service-stg` from step 1.
3. **Business unit:** the root business unit.
4. **Security roles:** only `Data Binding Service – Read`.
5. Create the user.

Application users don't need a licence.

## 4. Point the DBS at the new account

Edit `binding-service/.env`. It's gitignored, so never commit it; copy `binding-service/.env.sample` if you don't have one.

```
ADAPTER=icis
AZURE_TENANT_ID=<RAWA tenant id — unchanged>
AZURE_CLIENT_ID=<application (client) id from step 1>
AZURE_CLIENT_SECRET=<secret value from step 1>
DYNAMICS_URL=<ICIS test environment URL — unchanged>
```

Restart the DBS (`npm run dev`, or just `npm run dev -w binding-service`).

Once this is done, update the note in [CLAUDE.md](../../CLAUDE.md) and the proposal's "What the prototype found in test ICIS" section. Both still say the DBS borrows `feedback`'s credentials.

## Checking it worked

Open **Data bindings** in the app. You should see:

- [ ] Every attribute shows **Display only**, and the banner says the Data Binding Service's ICIS account can't write client records. That's expected for a read-only account.
- [ ] Title, Gender and Home language no longer say the account "can't read the … list".
- [ ] A **Gender** binding, saved as a draft, can now be **published**. It then appears in the form builder's *Data bound* palette.
- [ ] On a form with **Title**, the dropdown's options come from ICIS. In the service's `GET /bindings/client.title/options` response, `source` is `"live"`, not `"fallback"`.
- [ ] On a form's fill page, loading client number `00152076` (Bob McGee) still pre-fills his values.

## Things to check (untested assumptions)

- **The User read level.** If the Data bindings page can't work out the account's privileges (every lookup still flagged, or a DBS error mentioning `RetrieveUserPrivileges`), raise **User → Read** from *User* to *Business Unit*.
- **Metadata access.** The DBS reads table and column definitions (`EntityDefinitions`) to learn types and lengths. That normally needs no extra privilege. The first load of the Data bindings page with the new account confirms it; if it fails, the DBS logs the Dataverse error.

## 5. Later: letting bindings write back to ICIS

When form edits should save back to client records, add these to the role from step 2, and nothing more:

| Table | Privilege | Access level | Why |
|---|---|---|---|
| Contact | Write | Organization | Save edited bound values (names, preferred name, …) |
| Contact | Append | Organization | Set a contact's lookups (Title, Gender, …) |
| Salutation, Gender, Language | Append To | Organization | Allow those rows to be linked from a contact |

The DBS picks up changed privileges within about a minute; no restart is needed. Bindings on writable attributes can then be created as *Editable*. Existing display-only bindings stay that way until a steward publishes a new, editable version.

Before doing this for anything beyond test data, note that the requirements (§8) prohibit a service identity writing clinical data on a user's behalf. Real writes need the end user's own delegated token, so a write-capable service account is for prototyping against test ICIS only.
