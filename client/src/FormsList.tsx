import { useEffect, useState } from "react"
import type { FormSummary } from "shared"
import { createForm, listForms } from "./api.js"
import { FileTextIcon, PlusIcon } from "./icons.js"
import { EmptyState, formatDate, PageHeading } from "./ui.js"

interface FormsListProps {
  onBuild: (form: FormSummary) => void
  onFill: (form: FormSummary) => void
  onSubmissions: (form: FormSummary) => void
  onRendererSpike: () => void
}

// The standalone forms library, in the same record-card layout as the
// module and session template libraries.
export function FormsList({
  onBuild,
  onFill,
  onSubmissions,
  onRendererSpike,
}: FormsListProps) {
  const [forms, setForms] = useState<FormSummary[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )

  useEffect(() => {
    let cancelled = false
    listForms()
      .then((list) => {
        if (cancelled) return
        setForms(list)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleCreate() {
    const name = window.prompt("Form name?")
    if (!name) return
    createForm(name).then((form) => setForms((current) => [form, ...current]))
  }

  return (
    <main className="admin-page">
      <PageHeading
        eyebrow="FORM ADMINISTRATION"
        title="Forms"
        intro="Standalone forms, built field by field, published and filled out on their own."
        actions={
          <button type="button" className="primary" onClick={handleCreate}>
            <PlusIcon />
            New form
          </button>
        }
      />

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load forms.</p>}
      {status === "ready" && forms.length === 0 && (
        <EmptyState title="No forms yet" body="Create a form to get started." />
      )}
      {status === "ready" && forms.length > 0 && (
        <div className="record-list">
          {forms.map((form) => (
            <article key={form.id} className="record-card form-list__item">
              <div className="record-icon form">
                <FileTextIcon />
              </div>
              <div className="record-main">
                <div>
                  <h2>{form.name}</h2>
                </div>
                {form.description && <p>{form.description}</p>}
                <div className="record-meta">
                  <span>Created {formatDate(form.createdAt)}</span>
                </div>
              </div>
              <div className="record-actions">
                <button type="button" onClick={() => onBuild(form)}>
                  Edit
                </button>
                <button type="button" onClick={() => onFill(form)}>
                  Fill out
                </button>
                <button type="button" onClick={() => onSubmissions(form)}>
                  Submissions
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="page-footnote">
        <button type="button" className="back-link" onClick={onRendererSpike}>
          View renderer spike (US-0.2)
        </button>
      </p>
    </main>
  )
}
