import { useEffect, useState } from "react"
import type { ModuleSummary } from "shared"
import { archiveModule, createModule, listModules } from "./api.js"

interface ModulesListProps {
  onBack: () => void
  onBuild: (mod: ModuleSummary) => void
}

type Status = "loading" | "ready" | "error"

// Browse, search, create, and archive modules (US-7.4) -- the library an
// admin picks a module to build from, mirroring the forms list's shape.
export function ModulesList({ onBack, onBuild }: ModulesListProps) {
  const [modules, setModules] = useState<ModuleSummary[]>([])
  const [status, setStatus] = useState<Status>("loading")
  const [search, setSearch] = useState("")

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

  function handleArchive(moduleId: string) {
    archiveModule(moduleId).then(() => {
      setModules((current) => current.filter((mod) => mod.id !== moduleId))
    })
  }

  function handleCreate() {
    const name = window.prompt("Module name?")
    if (!name) return
    const description = window.prompt("Description (optional)?") || undefined
    createModule(name, description).then((mod) =>
      setModules((current) => [mod, ...current]),
    )
  }

  return (
    <main>
      <header className="form-builder__header">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <h1>Modules</h1>
      </header>

      <label>
        Search{" "}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search modules…"
        />
      </label>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p role="alert">Couldn't load modules.</p>}
      {status === "ready" && modules.length === 0 && (
        <p>No matches.</p>
      )}
      {status === "ready" && modules.length > 0 && (
        <ul>
          {modules.map((mod) => (
            <li key={mod.id} className="form-list__item">
              <span>{mod.name}</span>
              <button type="button" onClick={() => onBuild(mod)}>
                Build
              </button>
              <button type="button" onClick={() => handleArchive(mod.id)}>
                Archive
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="primary" onClick={handleCreate}>
        New module
      </button>
    </main>
  )
}
