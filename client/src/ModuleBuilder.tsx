import { useEffect, useState } from "react"
import { FIELD_TYPE_LABELS, type Field, type FieldType } from "shared"
import {
  getModuleActiveVersion,
  getModuleDraft,
  NoModuleDraftToPublishError,
  publishModule,
  saveModuleDraft,
} from "./api.js"
import { FieldInspector } from "./FieldInspector.js"
import { FieldPalette } from "./FieldPalette.js"
import { FormCanvas } from "./FormCanvas.js"
import { FormPreview } from "./FormPreview.js"

interface ModuleBuilderProps {
  moduleId: string
  moduleName: string
  onBack: () => void
}

// Moves the field at sourceIndex so it ends up at targetIndex -- identical
// to FormBuilder's `reorder`; duplicated rather than shared since modules
// and forms are intentionally independent features (see docs/proposals/
// modules-and-session-templates.md).
function reorder(fields: Field[], sourceIndex: number, targetIndex: number) {
  const next = [...fields]
  const [moved] = next.splice(sourceIndex, 1)
  const adjustedTarget =
    targetIndex > sourceIndex ? targetIndex - 1 : targetIndex
  next.splice(adjustedTarget, 0, moved)
  return next
}

function createField(type: FieldType): Field {
  const id = crypto.randomUUID()
  const label = FIELD_TYPE_LABELS[type]
  switch (type) {
    case "text":
      return { id, type, label, required: false }
    case "textarea":
      return { id, type, label, required: false }
    case "dropdown":
      return { id, type, label, required: false, options: [] }
    case "checkbox":
      return { id, type, label, required: false, defaultChecked: false }
    case "radio":
      return { id, type, label, required: false, options: [] }
    case "date":
      return { id, type, label, required: false }
    case "number":
      return { id, type, label, required: false }
  }
}

// Loads the module's current draft, then lets an admin drag field types
// from the palette onto the canvas to build it visually (US-7.2), reorder
// them, configure the selected field, delete it, preview it (US-7.5, via
// the same FormPreview component forms use -- it only depends on
// `fields`), and publish it (US-7.3). Mirrors FormBuilder.tsx exactly,
// retargeted at module endpoints.
export function ModuleBuilder({
  moduleId,
  moduleName,
  onBack,
}: ModuleBuilderProps) {
  const [fields, setFields] = useState<Field[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "error"
  >("idle")
  const [publishError, setPublishError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    getModuleDraft(moduleId)
      .then(async (draft) => {
        if (cancelled) return
        // Once a version is published there's no draft row until the next
        // edit creates one -- fall back to the active version's fields so
        // resuming editing starts from the module as it currently stands.
        if (draft) {
          setFields(draft.schema.fields)
        } else {
          const active = await getModuleActiveVersion(moduleId)
          if (cancelled) return
          setFields(active?.schema.fields ?? [])
        }
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [moduleId])

  function persist(next: Field[]) {
    setFields(next)
    setSaveError(null)
    saveModuleDraft(moduleId, next).catch(() => {
      setSaveError("Couldn't save this change — it may not persist.")
    })
  }

  function handleDrop(type: FieldType, index: number) {
    const field = createField(type)
    persist([...fields.slice(0, index), field, ...fields.slice(index)])
    setSelectedId(field.id)
  }

  function handleReorder(fieldId: string, index: number) {
    const sourceIndex = fields.findIndex((field) => field.id === fieldId)
    if (sourceIndex === -1) return
    persist(reorder(fields, sourceIndex, index))
  }

  function handleFieldChange(next: Field) {
    persist(fields.map((field) => (field.id === next.id ? next : field)))
  }

  function handleDelete(fieldId: string) {
    persist(fields.filter((field) => field.id !== fieldId))
    setSelectedId((current) => (current === fieldId ? null : current))
  }

  function handlePublish() {
    setPublishState("publishing")
    setPublishError(null)
    publishModule(moduleId)
      .then(() => setPublishState("idle"))
      .catch((error) => {
        setPublishState("error")
        setPublishError(
          error instanceof NoModuleDraftToPublishError
            ? error.message
            : "Couldn't publish this module.",
        )
      })
  }

  const selectedField = fields.find((field) => field.id === selectedId) ?? null

  return (
    <main className="form-builder">
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>{moduleName}</h1>
        {status === "ready" && (
          <button
            type="button"
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            {mode === "edit" ? "Preview" : "Back to editing"}
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
      {status === "error" && <p role="alert">Couldn't load this module.</p>}
      {saveError && <p role="alert">{saveError}</p>}
      {publishError && <p role="alert">{publishError}</p>}

      {status === "ready" && mode === "preview" && (
        <FormPreview fields={fields} />
      )}

      {status === "ready" && mode === "edit" && (
        <div className="form-builder__workspace">
          <FieldPalette />
          <FormCanvas
            fields={fields}
            selectedId={selectedId}
            onDrop={handleDrop}
            onReorder={handleReorder}
            onSelect={setSelectedId}
          />
          <FieldInspector
            field={selectedField}
            onChange={handleFieldChange}
            onDelete={handleDelete}
            isPublished={() => false}
          />
        </div>
      )}
    </main>
  )
}
