import { useState } from "react"
import type { SessionTemplateSummary } from "shared"
import { createSessionTemplate, listSessionTemplates } from "./api.js"
import { ArrowRightIcon } from "./icons.js"
import { BackLink, PageHeading } from "./ui.js"

// Creating a session template: its name and description, then on to the
// template builder to add modules.
export function SessionTemplateSetup({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (sessionTemplate: SessionTemplateSummary) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [state, setState] = useState<"idle" | "saving">("idle")
  const [error, setError] = useState<string | null>(null)

  async function handleNext() {
    const trimmed = name.trim()
    if (!trimmed) return
    setState("saving")
    setError(null)
    try {
      const matches = await listSessionTemplates(trimmed)
      if (matches.some((t) => t.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        setError("Template name is already in use. Please choose a different name.")
        setState("idle")
        return
      }
      onCreated(
        await createSessionTemplate(trimmed, description.trim() || undefined),
      )
    } catch {
      setError("Couldn't create this session template.")
      setState("idle")
    }
  }

  return (
    <main className="admin-page">
      <BackLink onClick={onCancel}>Back to session templates</BackLink>
      <PageHeading
        eyebrow="SESSION TEMPLATE BUILDER"
        title={name.trim() || "New template"}
        intro="Name the template, then build it from published modules."
      />
      {error && <p role="alert">{error}</p>}
      <section className="setup-card">
        <div className="setup-copy">
          <p className="eyebrow">TEMPLATE SETUP</p>
          <h2>Define the session template</h2>
          <p>
            A session template is the session note practitioners fill in. You'll
            add its modules on the next screen.
          </p>
        </div>
        <div className="setup-form">
          <label>
            Template name <span>*</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter a unique template name"
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Explain when this template is used"
            />
          </label>
          <div className="form-actions">
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
          </div>
        </div>
      </section>
    </main>
  )
}
