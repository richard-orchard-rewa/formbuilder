import { useEffect, useState } from "react"
import type { ModuleSummary } from "shared"
import { archiveModule, cloneModule, listModules } from "./api.js"
import {
  ArchiveIcon,
  CopyIcon,
  FilterIcon,
  LayersIcon,
  PlusIcon,
} from "./icons.js"
import {
  EmptyState,
  formatDate,
  Modal,
  PageHeading,
  SearchInput,
  useToast,
} from "./ui.js"

interface ModulesListProps {
  onNew: () => void
  onBuild: (mod: ModuleSummary) => void
}

type Status = "loading" | "ready" | "error"
type PublishFilter = "all" | "published" | "unpublished"

// Browse, search, create, clone and archive modules (US-7.4) -- the
// library an admin picks a module to build from, laid out as the design
// prototype's record cards.
export function ModulesList({ onNew, onBuild }: ModulesListProps) {
  const [modules, setModules] = useState<ModuleSummary[]>([])
  const [status, setStatus] = useState<Status>("loading")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<PublishFilter>("all")
  const [archiving, setArchiving] = useState<ModuleSummary | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, showToast] = useToast()

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    listModules(search)
      .then((result) => {
        if (cancelled) return
        setModules(result)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [search])

  function handleArchive(mod: ModuleSummary) {
    setArchiving(null)
    archiveModule(mod.id)
      .then(() => {
        setModules((current) => current.filter((m) => m.id !== mod.id))
        showToast("Module archived. Existing records are kept.")
      })
      .catch(() => setActionError(`Couldn't archive ${mod.name}.`))
  }

  function handleClone(mod: ModuleSummary) {
    setActionError(null)
    cloneModule(mod)
      .then((copy) => {
        setModules((current) => [copy, ...current])
        showToast(`${copy.name} created`)
      })
      .catch(() => setActionError(`Couldn't clone ${mod.name}.`))
  }

  const visible = modules.filter((mod) =>
    filter === "all"
      ? true
      : filter === "published"
        ? mod.hasPublishedVersion
        : !mod.hasPublishedVersion,
  )

  return (
    <main className="admin-page">
      {toast}
      <PageHeading
        eyebrow="SESSION FORM ADMINISTRATION"
        title="Modules"
        intro="Reusable modules practitioners complete during service delivery. Publish a module to use it in session templates."
        actions={
          <button type="button" className="primary" onClick={onNew}>
            <PlusIcon />
            Create module
          </button>
        }
      />

      <div className="list-toolbar">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search modules by name"
        />
        <label className="usage-filter">
          <FilterIcon />
          <select
            aria-label="Filter by status"
            value={filter}
            onChange={(event) => setFilter(event.target.value as PublishFilter)}
          >
            <option value="all">All modules</option>
            <option value="published">Published</option>
            <option value="unpublished">Not yet published</option>
          </select>
        </label>
      </div>

      {actionError && <p role="alert">{actionError}</p>}
      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load modules.</p>}
      {status === "ready" && visible.length === 0 && (
        <EmptyState
          title="No modules found"
          body="Try another search or filter, or create a new module."
        />
      )}
      {status === "ready" && visible.length > 0 && (
        <div className="record-list">
          {visible.map((mod) => (
            <article key={mod.id} className="record-card form-list__item">
              <div className="record-icon">
                <LayersIcon />
              </div>
              <div className="record-main">
                <div>
                  <h2>{mod.name}</h2>
                  {!mod.hasPublishedVersion && (
                    <span className="draft-tag">Not yet published</span>
                  )}
                </div>
                {mod.description && <p>{mod.description}</p>}
                <div className="record-meta">
                  <span>{mod.hasPublishedVersion ? "Published" : "Draft"}</span>
                  <span>Created {formatDate(mod.createdAt)}</span>
                </div>
              </div>
              <div className="record-actions">
                <button type="button" onClick={() => onBuild(mod)}>
                  Edit
                </button>
                <button type="button" onClick={() => handleClone(mod)}>
                  <CopyIcon />
                  Clone
                </button>
                <button type="button" onClick={() => setArchiving(mod)}>
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
          title="Archive module"
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
                Archive module
              </button>
            </>
          }
        >
          <p className="dialog-copy">
            <strong>{archiving.name}</strong> will no longer be available for
            new session templates. Templates already using it, and every
            record captured with it, are kept.
          </p>
        </Modal>
      )}
    </main>
  )
}
