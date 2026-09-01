import { useEffect, useState } from "react"
import { FIELD_TYPE_LABELS } from "shared"
import type { FieldMapping, MigrationPlan } from "shared"
import {
  getActiveVersion,
  getMigrationPlan,
  migrateSubmission,
  migrateVersion,
} from "./api.js"

interface MigrationPlannerProps {
  formId: string
  formName: string
  fromVersionId: string
  fromVersionNumber: number
  // When set, migrates just this one submission; otherwise migrates every
  // submitted submission captured against fromVersionId (US-6.1).
  submissionId?: string
  onBack: () => void
}

type Decision = { action: "drop" } | { action: "map"; targetFieldId: string }

type Status = "loading" | "ready" | "error" | "no-target"

// Lets an admin migrate submissions captured against an older form version
// onto the form's current active version (US-6.1). A field that still
// exists under the same id carries over automatically; anything else -- a
// field the newer version dropped, or one an admin replaced with a
// differently-typed field -- needs an explicit decision here, since
// there's no reliable way to infer "field X was replaced by field Y" from
// the schema alone (this app has no way to change a field's type in
// place, so a "type change" always shows up as one field disappearing and
// another appearing). Whatever isn't mapped, or can't be safely converted
// once it is, is never silently discarded -- the server keeps it as legacy
// data on the migrated submission.
export function MigrationPlanner({
  formId,
  formName,
  fromVersionId,
  fromVersionNumber,
  submissionId,
  onBack,
}: MigrationPlannerProps) {
  const [status, setStatus] = useState<Status>("loading")
  const [targetVersionId, setTargetVersionId] = useState<string | null>(null)
  const [targetVersionNumber, setTargetVersionNumber] = useState<
    number | null
  >(null)
  const [plan, setPlan] = useState<MigrationPlan | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getActiveVersion(formId)
      .then(async (active) => {
        if (cancelled) return
        if (!active) {
          setStatus("no-target")
          return
        }
        setTargetVersionId(active.id)
        setTargetVersionNumber(active.version)
        const result = await getMigrationPlan(formId, fromVersionId, active.id)
        if (cancelled) return
        setPlan(result)
        setDecisions(
          Object.fromEntries(
            result.unmappedSourceFields.map((field) => [
              field.id,
              { action: "drop" as const },
            ]),
          ),
        )
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [formId, fromVersionId])

  function buildFieldMappings(): FieldMapping[] {
    return Object.entries(decisions).map(([sourceFieldId, decision]) =>
      decision.action === "map"
        ? { sourceFieldId, action: "map", targetFieldId: decision.targetFieldId }
        : { sourceFieldId, action: "drop" },
    )
  }

  async function handleRun() {
    if (!targetVersionId) return
    setRunning(true)
    setRunError(null)
    setResultMessage(null)
    try {
      if (submissionId) {
        const migrated = await migrateSubmission(
          formId,
          submissionId,
          targetVersionId,
          buildFieldMappings(),
        )
        setResultMessage(
          migrated.status === "draft"
            ? "Migrated, but saved as a draft — a newly required field couldn't be filled from the old data. Open it from the submissions list to finish it."
            : "Migrated.",
        )
      } else {
        const result = await migrateVersion(
          formId,
          fromVersionId,
          targetVersionId,
          buildFieldMappings(),
        )
        const parts = [`${result.migratedCount} submission(s) migrated.`]
        if (result.needsFollowUpCount > 0) {
          parts.push(
            `${result.needsFollowUpCount} saved as drafts needing follow-up — a newly required field couldn't be filled.`,
          )
        }
        if (result.alreadyMigratedCount > 0) {
          parts.push(
            `${result.alreadyMigratedCount} were already migrated and were skipped.`,
          )
        }
        setResultMessage(parts.join(" "))
      }
    } catch {
      setRunError("Couldn't run this migration. Please try again.")
    } finally {
      setRunning(false)
    }
  }

  return (
    <main>
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>
          {formName} — Migrate {submissionId ? "submission" : "submissions"} v
          {fromVersionNumber} → v{targetVersionNumber ?? "?"}
        </h1>
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load the migration plan.</p>
      )}
      {status === "no-target" && (
        <p role="alert">This form has no published version to migrate to.</p>
      )}

      {status === "ready" && plan && (
        <>
          <section>
            <h2>Carried over automatically</h2>
            {plan.autoMappedFields.length === 0 && (
              <p>No fields are unchanged between these versions.</p>
            )}
            {plan.autoMappedFields.length > 0 && (
              <ul>
                {plan.autoMappedFields.map((field) => (
                  <li key={field.id}>
                    {field.label} ({FIELD_TYPE_LABELS[field.type]})
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Needs a decision</h2>
            {plan.unmappedSourceFields.length === 0 && (
              <p>Every field carries over automatically — nothing to decide.</p>
            )}
            {plan.unmappedSourceFields.map((field) => {
              const decision = decisions[field.id] ?? { action: "drop" as const }
              return (
                <label key={field.id} className="field-inspector__field">
                  {field.label} ({FIELD_TYPE_LABELS[field.type]})
                  <select
                    value={
                      decision.action === "map" ? decision.targetFieldId : ""
                    }
                    onChange={(event) => {
                      const value = event.target.value
                      setDecisions((current) => ({
                        ...current,
                        [field.id]: value
                          ? { action: "map", targetFieldId: value }
                          : { action: "drop" },
                      }))
                    }}
                  >
                    <option value="">Drop (keep as legacy data)</option>
                    {plan.targetFields.map((target) => (
                      <option key={target.id} value={target.id}>
                        Map to "{target.label}" ({FIELD_TYPE_LABELS[target.type]})
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </section>

          {runError && <p role="alert">{runError}</p>}
          {resultMessage && <p>{resultMessage}</p>}

          <button
            type="button"
            className="primary"
            onClick={handleRun}
            disabled={running}
          >
            {running ? "Migrating…" : "Run migration"}
          </button>
        </>
      )}
    </main>
  )
}
