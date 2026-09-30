import { useState, type ReactNode } from "react"
import type { ModuleScope, ModuleSummary } from "shared"
import { createModule, listModules, saveModuleDraft } from "./api.js"
import { ArrowRightIcon } from "./icons.js"
import { BackLink, PageHeading, WizardSteps } from "./ui.js"

export const MODULE_STEPS = ["Module setup", "Fields"]

const SCOPE_OPTIONS: { value: ModuleScope; label: string; hint: string }[] = [
  {
    value: "session",
    label: "Session",
    hint: "Completed once for the whole session.",
  },
  {
    value: "participant",
    label: "Session participant",
    hint: "Completed once for each participant — the only type that can hold a client's own details.",
  },
]

// Step 1 of the module builder, as in the design prototype: the module's
// name, description and type. A module's name and description are fixed
// once it's created, so an existing module shows them read-only; its type
// (scope) can still change while it holds nothing the new type can't reach.
export function ModuleSetupCard({
  name,
  description,
  scope,
  onNameChange,
  onDescriptionChange,
  onScopeChange,
  actions,
}: {
  name: string
  description: string
  scope: ModuleScope
  onNameChange?: (value: string) => void
  onDescriptionChange?: (value: string) => void
  onScopeChange: (scope: ModuleScope) => void
  actions?: ReactNode
}) {
  const identityLocked = !onNameChange
  return (
    <section className="setup-card">
      <div className="setup-copy">
        <p className="eyebrow">MODULE SETUP</p>
        <h2>Define the reusable module</h2>
        <p>
          Choose how often this module is completed in a session note. The
          type decides which data-bound fields it can hold.
        </p>
        {identityLocked && (
          <p>A module's name and description are set when it's created.</p>
        )}
      </div>
      <div className="setup-form">
        <label>
          Module name <span>*</span>
          <input
            type="text"
            value={name}
            readOnly={identityLocked}
            onChange={(event) => onNameChange?.(event.target.value)}
            placeholder="Enter a unique module name"
          />
        </label>
        <label>
          Module description
          <textarea
            value={description}
            readOnly={identityLocked}
            onChange={(event) => onDescriptionChange?.(event.target.value)}
            placeholder="Explain what the module captures and when it is used"
          />
        </label>
        <fieldset className="module-scope">
          <legend>
            Module type <span>*</span>
          </legend>
          <p>Select one module type.</p>
          {SCOPE_OPTIONS.map((option) => (
            <label className="option-check" key={option.value}>
              <input
                type="radio"
                name="module-scope"
                checked={scope === option.value}
                onChange={() => onScopeChange(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {actions && <div className="form-actions">{actions}</div>}
      </div>
    </section>
  )
}

// Creating a module: step 1 collects its setup, then "Next" creates it and
// hands over to the builder's fields step.
export function ModuleSetup({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (mod: ModuleSummary) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [scope, setScope] = useState<ModuleScope>("session")
  const [state, setState] = useState<"idle" | "saving">("idle")
  const [error, setError] = useState<string | null>(null)

  async function handleNext() {
    const trimmed = name.trim()
    if (!trimmed) return
    setState("saving")
    setError(null)
    try {
      const matches = await listModules(trimmed)
      if (matches.some((m) => m.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        setError("Module name is already in use. Please choose a different name.")
        setState("idle")
        return
      }
      const mod = await createModule(trimmed, description.trim() || undefined)
      await saveModuleDraft(mod.id, [], scope)
      onCreated(mod)
    } catch {
      setError("Couldn't create this module.")
      setState("idle")
    }
  }

  return (
    <main className="admin-page">
      <BackLink onClick={onCancel}>Back to modules</BackLink>
      <PageHeading
        eyebrow="MODULE BUILDER"
        title={name.trim() || "New module"}
        intro="Build a reusable module for practitioner and service-delivery workflows."
      />
      <WizardSteps
        steps={[
          { label: MODULE_STEPS[0] },
          { label: MODULE_STEPS[1], disabled: true },
        ]}
        current={0}
        onSelect={() => {}}
      />
      {error && <p role="alert">{error}</p>}
      <ModuleSetupCard
        name={name}
        description={description}
        scope={scope}
        onNameChange={setName}
        onDescriptionChange={setDescription}
        onScopeChange={setScope}
        actions={
          <>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!name.trim() || state === "saving"}
              onClick={handleNext}
            >
              {state === "saving" ? "Creating…" : "Next"}
              <ArrowRightIcon />
            </button>
          </>
        }
      />
    </main>
  )
}
