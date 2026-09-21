import { useEffect, useState } from "react"
import type { SessionTemplateSummary } from "shared"
import {
  archiveSessionTemplate,
  createSessionTemplate,
  listSessionTemplates,
} from "./api.js"

interface SessionTemplatesListProps {
  onBack: () => void
  onBuild: (sessionTemplate: SessionTemplateSummary) => void
  onFill: (sessionTemplate: SessionTemplateSummary) => void
  onSubmissions: (sessionTemplate: SessionTemplateSummary) => void
}

type Status = "loading" | "ready" | "error"

// Browse, search, create, and archive session templates (US-8.6) --
// mirrors ModulesList.tsx exactly, retargeted at session templates.
export function SessionTemplatesList({
  onBack,
  onBuild,
  onFill,
  onSubmissions,
}: SessionTemplatesListProps) {
  const [sessionTemplates, setSessionTemplates] = useState<
    SessionTemplateSummary[]
  >([])
  const [status, setStatus] = useState<Status>("loading")
  const [search, setSearch] = useState("")

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

  function handleArchive(sessionTemplateId: string) {
    archiveSessionTemplate(sessionTemplateId).then(() => {
      setSessionTemplates((current) =>
        current.filter((template) => template.id !== sessionTemplateId),
      )
    })
  }

  function handleCreate() {
    const name = window.prompt("Session template name?")
    if (!name) return
    const description = window.prompt("Description (optional)?") || undefined
    createSessionTemplate(name, description).then((template) =>
      setSessionTemplates((current) => [template, ...current]),
    )
  }

  return (
    <main>
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>Session templates</h1>
      </header>

      <label>
        Search{" "}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search session templates…"
        />
      </label>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load session templates.</p>}
      {status === "ready" && sessionTemplates.length === 0 && (
        <p>No matches.</p>
      )}
      {status === "ready" && sessionTemplates.length > 0 && (
        <ul>
          {sessionTemplates.map((template) => (
            <li key={template.id} className="form-list__item">
              <span>{template.name}</span>
              <button type="button" onClick={() => onBuild(template)}>
                Build
              </button>
              <button type="button" onClick={() => onFill(template)}>
                Fill out
              </button>
              <button type="button" onClick={() => onSubmissions(template)}>
                Submissions
              </button>
              <button type="button" onClick={() => handleArchive(template.id)}>
                Archive
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="primary" onClick={handleCreate}>
        New session template
      </button>
    </main>
  )
}
