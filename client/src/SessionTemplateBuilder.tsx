import { useEffect, useState } from "react"
import type {
  Field,
  ModuleSummary,
  SessionTemplateModule,
  SessionTemplateSummary,
} from "shared"
import {
  CannotPublishSessionTemplateError,
  getSessionTemplateModules,
  InvalidCompositionError,
  listModules,
  previewSessionTemplate,
  publishSessionTemplate,
  setSessionTemplateModules,
} from "./api.js"
import { FormPreview } from "./FormPreview.js"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ClipboardIcon,
  EyeIcon,
  HistoryIcon,
  LayersIcon,
  PlusIcon,
  SendIcon,
  TrashIcon,
} from "./icons.js"
import {
  BackLink,
  EmptyState,
  Modal,
  PageHeading,
  SearchInput,
  useToast,
} from "./ui.js"

interface SessionTemplateBuilderProps {
  sessionTemplate: SessionTemplateSummary
  onBack: () => void
  onViewHistory: () => void
}

// Lets an admin compose a session template from published modules (US-8.2),
// preview the combined result (US-8.3, via the same FormPreview component
// forms/modules use), and publish it (US-8.4), in the design prototype's
// three-column template builder: details, the ordered template canvas, and
// the module library. What's edited is which modules, in what order.
export function SessionTemplateBuilder({
  sessionTemplate,
  onBack,
  onViewHistory,
}: SessionTemplateBuilderProps) {
  const sessionTemplateId = sessionTemplate.id
  const [composition, setComposition] = useState<SessionTemplateModule[]>([])
  const [availableModules, setAvailableModules] = useState<ModuleSummary[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addSearch, setAddSearch] = useState("")
  const [previewing, setPreviewing] = useState(false)
  const [previewFields, setPreviewFields] = useState<Field[] | null>(null)
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "error"
  >("idle")
  const [publishError, setPublishError] = useState<string | null>(null)
  const [toast, showToast] = useToast()

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
    setPreviewing(true)
    setPreviewFields(null)
    previewSessionTemplate(sessionTemplateId)
      .then(({ fields }) => setPreviewFields(fields))
      .catch(() => setPreviewFields([]))
  }

  function handlePublish() {
    setPublishState("publishing")
    setPublishError(null)
    publishSessionTemplate(sessionTemplateId)
      .then((version) => {
        setPublishState("idle")
        showToast(
          `${sessionTemplate.name} published as version ${version.version}`,
        )
      })
      .catch((error) => {
        setPublishState("error")
        setPublishError(
          error instanceof CannotPublishSessionTemplateError
            ? error.message
            : "Couldn't publish this session template.",
        )
      })
  }

  const usedModuleIds = new Set(composition.map((item) => item.moduleId))
  const moduleById = new Map(availableModules.map((mod) => [mod.id, mod]))
  const matchingModules = availableModules.filter(
    (mod) =>
      mod.hasPublishedVersion &&
      mod.name.toLowerCase().includes(addSearch.trim().toLowerCase()),
  )

  return (
    <main className="admin-page">
      {toast}
      <BackLink onClick={onBack}>Back to session templates</BackLink>
      <PageHeading
        eyebrow="SESSION TEMPLATE BUILDER"
        title={sessionTemplate.name}
        intro="Build the template from published modules and arrange the order practitioners complete them in."
        actions={
          status === "ready" && (
            <>
              <button type="button" onClick={handlePreview}>
                <EyeIcon />
                Preview
              </button>
              <button type="button" onClick={onViewHistory}>
                <HistoryIcon />
                Version history
              </button>
              <button
                type="button"
                className="primary"
                onClick={handlePublish}
                disabled={publishState === "publishing"}
              >
                <SendIcon />
                {publishState === "publishing" ? "Publishing…" : "Publish"}
              </button>
              <span className="draft-badge">Changes save as a draft</span>
            </>
          )
        }
      />

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load this session template.</p>
      )}
      {saveError && <p role="alert">{saveError}</p>}
      {publishError && <p role="alert">{publishError}</p>}

      {status === "ready" && (
        <div className="builder-grid template-builder-grid">
          <aside className="template-details">
            <p className="eyebrow">TEMPLATE DETAILS</p>
            <label>
              Template name
              <input type="text" value={sessionTemplate.name} readOnly />
            </label>
            <label>
              Description
              <textarea
                value={sessionTemplate.description ?? ""}
                placeholder="No description"
                readOnly
              />
            </label>
            <p className="library-help">
              A template's name and description are set when it's created.
              Publishing freezes the modules' current published versions into a
              new template version.
            </p>
          </aside>

          <section className="template-canvas">
            <div className="canvas-heading">
              <div>
                <p className="eyebrow">TEMPLATE CANVAS</p>
                <h2>Modules in this template</h2>
                <p>Completed in this order in a session note.</p>
              </div>
              <span>
                {composition.length}{" "}
                {composition.length === 1 ? "module" : "modules"}
              </span>
            </div>
            {composition.length === 0 && (
              <EmptyState
                title="No modules added"
                body="Choose published modules from the module library."
              />
            )}
            {composition.map((item, index) => {
              const mod = moduleById.get(item.moduleId)
              return (
                <article className="template-module-card" key={item.moduleId}>
                  <span className="order-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{item.name}</strong>
                    {mod?.description && <small>{mod.description}</small>}
                  </div>
                  <div className="field-actions">
                    <button
                      type="button"
                      aria-label={`Move ${item.name} up`}
                      onClick={() => handleMove(item.moduleId, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${item.name} down`}
                      onClick={() => handleMove(item.moduleId, 1)}
                      disabled={index === composition.length - 1}
                    >
                      <ArrowDownIcon />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => handleRemove(item.moduleId)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </article>
              )
            })}
          </section>

          <aside className="module-picker">
            <div>
              <p className="eyebrow">ADD MODULE</p>
              <h2>Module library</h2>
              <p>Only published modules can be added to a template.</p>
            </div>
            <SearchInput
              className="compact-search"
              label="Search published modules"
              value={addSearch}
              onChange={setAddSearch}
              placeholder="Search by name"
            />
            {matchingModules.length === 0 && (
              <p className="library-help">No matching published modules.</p>
            )}
            <ul className="picker-list">
              {matchingModules.map((mod) => {
                const used = usedModuleIds.has(mod.id)
                return (
                  <li key={mod.id} className="module-picker__item">
                    <button
                      type="button"
                      disabled={used}
                      aria-label={
                        used ? `${mod.name} (already added)` : `Add ${mod.name}`
                      }
                      onClick={() => handleAdd(mod)}
                    >
                      <LayersIcon />
                      <span>
                        <strong>{mod.name}</strong>
                        {mod.description && <small>{mod.description}</small>}
                      </span>
                      {used ? <CheckIcon /> : <PlusIcon />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>
        </div>
      )}

      {previewing && (
        <Modal
          wide
          title={`${sessionTemplate.name} preview`}
          onClose={() => setPreviewing(false)}
          footer={
            <button
              type="button"
              className="primary"
              onClick={() => setPreviewing(false)}
            >
              Close preview
            </button>
          }
        >
          <div className="preview-meta">
            <span>
              <ClipboardIcon />
              Session template
            </span>
            <span>
              {composition.length}{" "}
              {composition.length === 1 ? "module" : "modules"}
            </span>
          </div>
          {previewFields === null ? (
            <p>Loading…</p>
          ) : (
            <FormPreview fields={previewFields} />
          )}
        </Modal>
      )}
    </main>
  )
}
