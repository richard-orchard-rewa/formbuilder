import { useEffect, useState } from "react"
import type { SessionTemplateSummary } from "shared"
import {
  archiveSessionTemplate,
  cloneSessionTemplate,
  listSessionTemplates,
} from "./api.js"
import { ArchiveIcon, ClipboardIcon, CopyIcon, PlusIcon } from "./icons.js"
import {
  EmptyState,
  formatDate,
  Modal,
  PageHeading,
  SearchInput,
  useToast,
} from "./ui.js"

interface SessionTemplatesListProps {
  onNew: () => void
  onBuild: (sessionTemplate: SessionTemplateSummary) => void
  onFill: (sessionTemplate: SessionTemplateSummary) => void
  onSubmissions: (sessionTemplate: SessionTemplateSummary) => void
}

type Status = "loading" | "ready" | "error"

// Browse, search, create, clone and archive session templates (US-8.6) --
// the same record-card library as ModulesList.tsx, retargeted at session
// templates.
export function SessionTemplatesList({
  onNew,
  onBuild,
  onFill,
  onSubmissions,
}: SessionTemplatesListProps) {
  const [sessionTemplates, setSessionTemplates] = useState<
    SessionTemplateSummary[]
  >([])
  const [status, setStatus] = useState<Status>("loading")
  const [search, setSearch] = useState("")
  const [archiving, setArchiving] = useState<SessionTemplateSummary | null>(
    null,
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, showToast] = useToast()

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    listSessionTemplates(search)
      .then((result) => {
        if (cancelled) return
        setSessionTemplates(result)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [search])

  function handleArchive(template: SessionTemplateSummary) {
    setArchiving(null)
    archiveSessionTemplate(template.id)
      .then(() => {
        setSessionTemplates((current) =>
          current.filter((t) => t.id !== template.id),
        )
        showToast("Template archived. Existing records remain available.")
      })
      .catch(() => setActionError(`Couldn't archive ${template.name}.`))
  }

  function handleClone(template: SessionTemplateSummary) {
    setActionError(null)
    cloneSessionTemplate(template)
      .then((copy) => {
        setSessionTemplates((current) => [copy, ...current])
        showToast(`${copy.name} created`)
      })
      .catch(() => setActionError(`Couldn't clone ${template.name}.`))
  }

  return (
    <main className="admin-page">
      {toast}
      <PageHeading
        eyebrow="SESSION FORM ADMINISTRATION"
        title="Session templates"
        intro="Assemble published modules into the session notes practitioners fill in."
        actions={
          <button type="button" className="primary" onClick={onNew}>
            <PlusIcon />
            Create template
          </button>
        }
      />

      <div className="list-toolbar">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search templates by name"
        />
      </div>

      {actionError && <p role="alert">{actionError}</p>}
      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <p role="alert">Couldn't load session templates.</p>
      )}
      {status === "ready" && sessionTemplates.length === 0 && (
        <EmptyState
          title="No templates found"
          body="Try another search, or create a new template."
        />
      )}
      {status === "ready" && sessionTemplates.length > 0 && (
        <div className="record-list">
          {sessionTemplates.map((template) => (
            <article
              key={template.id}
              className="record-card form-list__item"
            >
              <div className="record-icon template">
                <ClipboardIcon />
              </div>
              <div className="record-main">
                <div>
                  <h2>{template.name}</h2>
                </div>
                {template.description && <p>{template.description}</p>}
                <div className="record-meta">
                  <span>Created {formatDate(template.createdAt)}</span>
                </div>
              </div>
              <div className="record-actions">
                <button type="button" onClick={() => onBuild(template)}>
                  Edit
                </button>
                <button type="button" onClick={() => onFill(template)}>
                  Fill out
                </button>
                <button type="button" onClick={() => onSubmissions(template)}>
                  Submissions
                </button>
                <button type="button" onClick={() => handleClone(template)}>
                  <CopyIcon />
                  Clone
                </button>
                <button type="button" onClick={() => setArchiving(template)}>
                  <ArchiveIcon />
                  Archive
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {archiving && (
        <Modal
          title="Archive template"
          onClose={() => setArchiving(null)}
          footer={
            <>
              <button type="button" onClick={() => setArchiving(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => handleArchive(archiving)}
              >
                <ArchiveIcon />
                Archive template
              </button>
            </>
          }
        >
          <p className="dialog-copy">
            <strong>{archiving.name}</strong> will no longer be offered for
            new session notes. Every session note already captured with it
            is kept.
          </p>
        </Modal>
      )}
    </main>
  )
}
