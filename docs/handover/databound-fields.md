# Handover: data-bound fields (as of 2026-09-25)

Where the data-bound fields work got to, so it can be picked up later. The design and reasoning are in [the proposal](../proposals/databound-fields.md); this document is the "where are we, and how do I get going again" view.

## In one paragraph

A data-bound field is a form control that reads from, and can save back to, a record in another system (ICIS today). form-builder never talks to ICIS: everything goes through a separate **Data Binding Service** (DBS, `binding-service/`) that owns a self-describing dictionary of bindable fields and all ICIS access. There are three pieces:
- **Runtime:** forms render bound fields, pre-fill them for a chosen client, and save changes back with per-field outcomes, including conflicts.
- **Binding creator:** a data steward creates new bound fields on allow-listed ICIS attributes, with no developer. Limits come from ICIS's own metadata and the service's own ICIS privileges.
- **Mock ICIS** (`mock-icis/`): runs the whole thing on made-up data for demos.

All of it is a prototype on one branch, not yet merged.

## Branch and PR status

- **Branch:** `claude/databound-field-design-e44228` (worktree `.claude/worktrees/issue-21-37f6d0`), cut from `main`. `main` had no new commits as of this handover.
- **Not pushed yet, and no PR open.** The push was blocked by Claude Code's permission settings. To finish:

  ```bash
  git push -u origin claude/databound-field-design-e44228
  gh pr create --base main --title "Prototype data-bound fields via a Data Binding Service" --body-file docs/handover/pr-body.md
  ```

  [`pr-body.md`](pr-body.md) is a ready-made PR description.
- **Commits, oldest first:**

  | Commit | What |
  |---|---|
  | `7b761f2` | DBS + bound fields: Title / First / Last name, read-only Client number, against test ICIS |
  | `861a66d` | Binding creator (strategies, allow-list, privilege ceiling), plus the proposal's "Creating bindings without a developer" section |
  | `94df491` | Setup guide for a dedicated read-only ICIS account |
  | `54c8ffd` | Mock ICIS, demo mode, contract test, and the demo walkthrough |
  | `eb6969b` | Creator keeps limits current (re-checks on tab focus), and Save and publish |
  | *(this commit)* | This handover |

- **Checks at handover:**
  - Typecheck clean in all six workspaces.
  - 94 unit tests pass: shared 10, server 22, binding-service 38, mock-icis 6, client 19.
  - `npm audit --omit=dev` is clean.
  - **The Playwright e2e suite has not been run** on this branch. The existing e2e tests don't start the DBS; the palette then just shows "not available" and custom fields work as before, but that hasn't been confirmed by a run.

## What exists

| Area | Where | Notes |
|---|---|---|
| Design | [`docs/proposals/databound-fields.md`](../proposals/databound-fields.md) | Why an API; the contract; the strategies vs configuration model; guardrails; what Phases 0 and 0.5 built and found |
| Demo script | [`docs/demo/databound-fields-demo.md`](../demo/databound-fields-demo.md) | ~20 min, by role: developer, ICIS admin, data steward, form admin, practitioner |
| ICIS account setup | [`docs/setup/icis-binding-service-account.md`](../setup/icis-binding-service-account.md) | Entra app registration + Dataverse application user with a read-only role |
| DBS | `binding-service/` | `dictionary.ts` (built-in bindings), `allow-list.ts`, `creator.ts`, `service.ts`, `registry.ts`, `adapters/icis.ts` (the only ICIS-aware code), `adapters/fake.ts` |
| Contracts | `shared/src/schemas/binding.ts`; `bound` field in `shared/src/schemas/field.ts` | Bound fields render through the normal `toJsonSchema` → JSON Forms path |
| form-builder server | `server/src/modules/bindings/` | Relays the DBS to the browser; commits bound values after a submission is saved; `submission_bindings` table (migration `0011`) |
| form-builder client | `FieldPalette`, `FieldInspector`, `FormFill` (client picker, results), `DataBindings.tsx` (creator page), `schema/useBindingOptions.ts` | |
| Mock ICIS | `mock-icis/` | Dataverse Web API subset + Clients / Service account / API log screens; `contract.test.ts` runs the DBS's real adapter against it |

## Running it again

You'll need Docker Desktop running.

```bash
docker compose up -d
npm run db:migrate -w server
npm run demo      # mock ICIS :3200, DBS :3100 (pointed at the mock), server :3000, client :5173
# or
npm run dev       # the same, but the DBS uses binding-service/.env (ADAPTER=fake or icis)
```

- **`binding-service/.env`** is gitignored, so it isn't in the repo.
  - It currently holds `ADAPTER=icis` plus the **test-ICIS credentials copied from `feedback`** (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `DYNAMICS_URL`). That borrowing was agreed as a stopgap.
  - For no ICIS at all, use `ADAPTER=fake`; `.env.sample` shows the shape.
- **`binding-service/.env.demo`** is committed and holds no secrets. It's what `npm run demo` uses.
- **Where bindings made in the creator live:**
  - `binding-service/data/bindings.<adapter>.json` (gitignored).
  - Demo runs use `bindings.demo.json`; clear it with `npm run demo:reset`.
  - The mock's own data resets with its **Reset demo** button, or on restart.
- **Test ICIS contact used throughout:** Bob McGee, client number `00152076`. He's also in the mock, alongside 19 made-up clients `00152077`–`00152095`.

## Decisions made (and by whom)

- **Everything through an API.** form-builder never calls ICIS; the DBS is a separate deployable, and a workspace here only for convenience. *(Richard, from the start.)*
- **The prototype may borrow `feedback`'s test-ICIS credentials** until the DBS has its own account. *(Richard.)* Never extend this to shared code, data or databases.
- **Stewards create bindings without a developer, by configuring developer-written strategies** (`attribute`, `lookup` so far) on an allow-list of attributes. *(Agreed after discussion; see the proposal.)*
- **Commits happen on submit only, not on draft save, and synchronously.** This is a prototype simplification; an outbox with retries is needed before real use.
- **Read-only referenced values are pinned; writable ones report conflicts** instead of overwriting. The proposal's decision 1 is only partly built: the "changed in ICIS since" indicator when re-viewing a submission isn't done.

## What we found in test ICIS

- **Title is a lookup,** `contact.csg_salutationid` → `csg_salutation`, not free text. The client number is `contact.csg_clientid`. Contact 00152076 (Bob McGee) is `2c616f0e-d741-f011-8779-000d3ad0ea14`.
- **The borrowed account can read contacts but not write them.** It lacks `prvWriteContact`, so every real write is refused, and every binding is display-only against real ICIS.
- **It can't read any of the reference tables behind contact's custom lookups** (salutation, gender, language, country, …). Title falls back to five known values, and no new lookup binding can be published.
- **`contact`'s updatable attributes include portal password hashes, the DSS/DEX client ID and government card numbers.** That's why the allow-list exists.

## Next steps, in rough order

1. **Push the branch and open the PR** (commands above). Then run the e2e suite in CI.
2. **Get the DBS its own ICIS account**, per the [setup guide](../setup/icis-binding-service-account.md). Start read-only; add Write, Append and Append To to see real writes land in test ICIS. Then update `binding-service/.env`, the note in `CLAUDE.md`, and the proposal's findings.
3. **Bound fields in modules and session templates.** At the moment only the form builder offers them, and session-template fill doesn't commit.
4. **Remember the client when a draft is resumed.** Today a resumed draft forgets which client it was for.
5. **An outbox for commits** (a queue with retries, like `feedback`'s ICIS sync), so an ICIS or DBS outage never blocks finalising.
6. **The next strategies:** `set-membership` (presenting needs) and `child-collection` (referrals, per participant).
7. **A validation-type library** (phone, email, Medicare, …) that bindings reference and that's enforced in both the form and the DBS.
8. **Identity:** Entra sign-in for form-builder, then on-behalf-of tokens to the DBS. §8 of the requirements rules out a service account for real clinical writes.
9. **Steward permissions** on the Data bindings page, which is currently open to anyone.

## Gotchas hit along the way

- **Shell `cd` fails in this environment.** The shell's Node version manager (fnm) hook errors on `cd`, so `cd x && …` never runs. Run tools from the repo root with paths, e.g. `node node_modules/typescript/bin/tsc -p server`.
- **Docker port clashes.** Other projects' Postgres containers also bind 5432. If this worktree's container starts without its port, stop the other container and run `docker compose up -d --force-recreate`.
- **`drizzle-kit migrate` can fail silently** (a spinner, then exit 1). If migrations don't apply, check that the database is actually reachable on 5432.
- **"New form" uses `window.prompt`,** which automated browsers can't answer. Create forms via `POST /api/forms` when scripting.
- **Neither the DBS nor the server runs in watch mode;** restart them after code changes. The client (Vite) hot-reloads.
