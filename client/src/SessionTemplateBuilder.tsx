import { useEffect, useState } from "react"
import type { Field, ModuleSummary, SessionTemplateModule } from "shared"
import {
  EmptyCompositionError,
  getSessionTemplateModules,
  InvalidCompositionError,
  listModules,
  previewSessionTemplate,
  publishSessionTemplate,
  setSessionTemplateModules,
} from "./api.js"
import { FormPreview } from "./FormPreview.js"

interface SessionTemplateBuilderProps {
  sessionTemplateId: string
  sessionTemplateName: string
  onBack: () => void
  onViewHistory: () => void
}

// Lets an admin compose a session template from published modules (US-8.2),
// preview the combined result (US-8.3, via the same FormPreview component
// forms/modules use), and publish it (US-8.4). Unlike FormBuilder/
// ModuleBuilder there's no field-by-field canvas here -- what's edited is
// which modules, in what order.
export function SessionTemplateBuilder({
  sessionTemplateId,
  sessionTemplateName,
  onBack,
  onViewHistory,
}: SessionTemplateBuilderProps) {
  const [composition, setComposition] = useState<SessionTemplateModule[]>([])
  const [availableModules, setAvailableModules] = useState<ModuleSummary[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addSearch, setAddSearch] = useState("")
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [previewFields, setPreviewFields] = useState<Field[]>([])
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "error"
  >("idle")
  const [publishError, setPublishError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    Promise.all([
      getSessionTemplateModules(sessionTemplateId),
      listModules(),
    ])
      .then(([comp, mods]) => {
        if (cancelled) return
        setComposition(comp)
        setAvailableModules(mods)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [sessionTemplateId])

  function persist(next: SessionTemplateModule[]) {
    setComposition(next)
    setSaveError(null)
    setSessionTemplateModules(
      sessionTemplateId,
      next.map((item) => item.moduleId),
    ).catch((error) => {
      setSaveError(
        error instanceof InvalidCompositionError
          ? error.message
          : "Couldn't save this change — it may not persist.",
      )
    })
  }

  function handleAdd(mod: ModuleSummary) {
    persist([...composition, { moduleId: mod.id, name: mod.name }])
  }

  function handleRemove(moduleId: string) {
    persist(composition.filter((item) => item.moduleId !== moduleId))
  }

  function handleMove(moduleId: string, direction: -1 | 1) {
    const index = composition.findIndex((item) => item.moduleId === moduleId)
    const target = index + direction
    if (index === -1 || target < 0 || target >= composition.length) return
    const next = [...composition]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  function handlePreview() {
    setMode("preview")
    previewSessionTemplate(sessionTemplateId)
      .then(({ fields }) => setPreviewFields(fields))
      .catch(() => setPreviewFields([]))
  }

  function handlePublish() {
    setPublishState("publishing")
    setPublishError(null)
    publishSessionTemplate(sessionTemplateId)
      .then(() => setPublishState("idle"))
      .catch((error) => {
        setPublishState("error")
        setPublishError(
          error instanceof EmptyCompositionError
            ? error.message
            : "Couldn't publish this session template.",
        )
      })
  }

  const usedModuleIds = new Set(composition.map((item) => item.moduleId))
  const pickableModules = availableModules.filter(
    (mod) =>
      mod.hasPublishedVersion &&
      !usedModuleIds.has(mod.id) &&
      mod.name.toLowerCase().includes(addSearch.trim().toLowerCase()),
  )

  return (
    <main className="form-builder">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{sessionTemplateName}</h1>
        {status === "ready" && (
          <button
            type="button"
            onClick={mode === "edit" ? handlePreview : () => setMode("edit")}
          >
            {mode === "edit" ? "Preview" : "Back to editing"}
          </button>
        )}
        {status === "ready" && (
          <button type="button" onClick={onViewHistory}>
            Version history
          </button>
        )}
        {status === "ready" && (
          <button
            type="button"
            className="primary"
            onClick={handlePublish}
            disabled={publishState === "publishing"}
          >
            {publishState === "publishing" ? "Publishing…" : "Publish"}
          </button>
        )}
      </header>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this session template.</p>
      )}
      {saveError && <p role="alert">{saveError}</p>}
      {publishError && <p role="alert">{publishError}</p>}

      {status === "ready" && mode === "preview" && (
        <FormPreview fields={previewFields} />
      )}

      {status === "ready" && mode === "edit" && (
        <div className="form-builder__workspace">
          <section>
            <h2>Modules in this template</h2>
            {composition.length === 0 && <p>No modules yet — add one below.</p>}
            <ol>
              {composition.map((item, index) => (
                <li key={item.moduleId} className="form-canvas__field">
                  <span>{item.name}</span>
                  <button
                    type="button"
                    aria-label={`Move ${item.name} up`}
                    onClick={() => handleMove(item.moduleId, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${item.name} down`}
                    onClick={() => handleMove(item.moduleId, 1)}
                    disabled={index === composition.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.moduleId)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2>Add a module</h2>
            <label>
              Search{" "}
              <input
                type="search"
                value={addSearch}
                onChange={(event) => setAddSearch(event.target.value)}
                placeholder="Search published modules…"
              />
            </label>
            {pickableModules.length === 0 && (
              <p>No matching published modules.</p>
            )}
            <ul>
              {pickableModules.map((mod) => (
                <li key={mod.id} className="field-palette__item">
                  <span>{mod.name}</span>
                  <button type="button" onClick={() => handleAdd(mod)}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  )
}
