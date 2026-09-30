import { useEffect, useState } from "react"
import {
  FIELD_TYPE_LABELS,
  SCOPE_ANCHORS,
  isBoundField,
  unreachableBoundFields,
  type BindingDescriptor,
  type Field,
  type FieldType,
  type ModuleScope,
  type ModuleSummary,
} from "shared"
import {
  getModuleActiveVersion,
  getModuleDraft,
  listBindings,
  NoModuleDraftToPublishError,
  publishModule,
  saveModuleDraft,
} from "./api.js"
import { FieldInspector } from "./FieldInspector.js"
import { FieldPalette, type PaletteBindings } from "./FieldPalette.js"
import { FormCanvas } from "./FormCanvas.js"
import { FormPreview } from "./FormPreview.js"
import { EyeIcon, SendIcon } from "./icons.js"
import { MODULE_STEPS, ModuleSetupCard } from "./ModuleSetup.js"
import { BackLink, Modal, PageHeading, useToast, WizardSteps } from "./ui.js"

interface ModuleBuilderProps {
  mod: ModuleSummary
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

// A data-bound field starts with the dictionary's own label and a snapshot
// of its descriptor -- as in FormBuilder.tsx.
function createBoundField(binding: BindingDescriptor): Field {
  return {
    id: crypto.randomUUID(),
    type: "bound",
    label: binding.label,
    required: false,
    binding,
    ...(binding.presentations ? { presentation: binding.presentations.default } : {}),
  }
}

const SCOPE_LABELS: Record<ModuleScope, string> = {
  session: "Completed once per session",
  participant: "Completed once per participant",
}

// Loads the module's current draft and lays out the design prototype's
// two-step module builder: "Module setup" (its type -- how often it's
// filled in) and "Fields", where an admin adds fields from the library by
// clicking or dragging (US-7.2), reorders them, configures the selected
// field, deletes it, previews the module (US-7.5, via the same FormPreview
// component forms use) and publishes it (US-7.3). Every change saves to
// the draft as it's made.
export function ModuleBuilder({ mod, onBack }: ModuleBuilderProps) {
  const moduleId = mod.id
  const [fields, setFields] = useState<Field[]>([])
  // How often the module is filled in within a session note; decides which
  // bindings it can hold (a client's details only once per participant).
  const [scope, setScope] = useState<ModuleScope>("session")
  const [allBindings, setAllBindings] = useState<PaletteBindings>({
    status: "loading",
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )
  const [step, setStep] = useState(1)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "error"
  >("idle")
  const [publishError, setPublishError] = useState<string | null>(null)
  const [toast, showToast] = useToast()

  // The Data Binding Service's dictionary, best-effort as in FormBuilder.
  useEffect(() => {
    let cancelled = false
    listBindings()
      .then((list) => {
        if (!cancelled) setAllBindings({ status: "ready", bindings: list })
      })
      .catch(() => {
        if (!cancelled) setAllBindings({ status: "unavailable" })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const bindings: PaletteBindings =
    allBindings.status === "ready"
      ? {
          status: "ready",
          bindings: allBindings.bindings.filter((b) =>
            SCOPE_ANCHORS[scope].includes(b.anchor),
          ),
        }
      : allBindings

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
          setScope(draft.schema.scope ?? "session")
        } else {
          const active = await getModuleActiveVersion(moduleId)
          if (cancelled) return
          setFields(active?.schema.fields ?? [])
          setScope(active?.schema.scope ?? "session")
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

  function persist(next: Field[], nextScope: ModuleScope = scope) {
    setFields(next)
    setSaveError(null)
    saveModuleDraft(moduleId, next, nextScope).catch(() => {
      setSaveError("Couldn't save this change — it may not persist.")
    })
  }

  // A module can only change scope once it holds nothing the new scope
  // can't reach.
  function handleScopeChange(next: ModuleScope) {
    const unreachable = unreachableBoundFields(fields, next)
    if (unreachable.length > 0) {
      setSaveError(
        `Remove ${unreachable.map((f) => f.label).join(", ")} first — ${
          next === "session" ? "a once-per-session" : "a once-per-participant"
        } module can't hold ${unreachable.length === 1 ? "it" : "them"}.`,
      )
      return
    }
    setScope(next)
    persist(fields, next)
  }

  function insertBinding(key: string, index: number) {
    if (bindings.status !== "ready") return
    const binding = bindings.bindings.find((b) => b.key === key)
    if (!binding) return
    const field = createBoundField(binding)
    persist([...fields.slice(0, index), field, ...fields.slice(index)])
    setSelectedId(field.id)
  }

  function insertField(type: FieldType, index: number) {
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
      .then((version) => {
        setPublishState("idle")
        showToast(`${mod.name} published as version ${version.version}`)
      })
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
  const usedBindingKeys = new Set(
    fields.filter(isBoundField).map((field) => field.binding.key),
  )

  return (
    <main className="admin-page">
      {toast}
      <BackLink onClick={onBack}>Back to modules</BackLink>
      <PageHeading
        eyebrow="MODULE BUILDER"
        title={mod.name}
        intro={
          mod.description ??
          "Build a reusable module for practitioner and service-delivery workflows."
        }
        actions={
          status === "ready" && (
            <>
              <button type="button" onClick={() => setPreviewing(true)}>
                <EyeIcon />
                Preview
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
      {status === "error" && <p role="alert">Couldn't load this module.</p>}
      {saveError && <p role="alert">{saveError}</p>}
      {publishError && <p role="alert">{publishError}</p>}

      {status === "ready" && (
        <WizardSteps
          steps={[
            { label: MODULE_STEPS[0], complete: true },
            { label: MODULE_STEPS[1] },
          ]}
          current={step}
          onSelect={setStep}
        />
      )}

      {status === "ready" && step === 0 && (
        <ModuleSetupCard
          name={mod.name}
          description={mod.description ?? ""}
          scope={scope}
          onScopeChange={handleScopeChange}
          actions={
            <button type="button" className="primary" onClick={() => setStep(1)}>
              Continue to fields
            </button>
          }
        />
      )}

      {status === "ready" && step === 1 && (
        <div className="builder-grid">
          <FieldPalette
            bindings={bindings}
            onAddType={(type) => insertField(type, fields.length)}
            onAddBinding={(key) => insertBinding(key, fields.length)}
            usedBindingKeys={usedBindingKeys}
          />
          <FormCanvas
            eyebrow="MODULE CANVAS"
            title="Fields in this module"
            subtitle={SCOPE_LABELS[scope]}
            fields={fields}
            selectedId={selectedId}
            onDrop={insertField}
            onDropBinding={insertBinding}
            onReorder={handleReorder}
            onSelect={setSelectedId}
            onDelete={handleDelete}
          />
          <FieldInspector
            field={selectedField}
            onChange={handleFieldChange}
            onDelete={handleDelete}
            isPublished={() => false}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {previewing && (
        <Modal
          wide
          title={`${mod.name} preview`}
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
            <span>Module</span>
            <span>{SCOPE_LABELS[scope]}</span>
          </div>
          <FormPreview fields={fields} />
        </Modal>
      )}
    </main>
  )
}
