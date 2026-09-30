import { useEffect, useMemo, useState } from "react"
import type { FormSummary, ModuleSummary, SessionTemplateSummary } from "shared"
import {
  listBindings,
  listForms,
  listModules,
  listSessionTemplates,
} from "./api.js"
import type { NavKey } from "./AdminShell.js"
import {
  ChevronRightIcon,
  ClipboardIcon,
  DatabaseIcon,
  FileTextIcon,
  LayersIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "./icons.js"
import { PageHeading, SearchInput } from "./ui.js"

type SearchKind = "Modules" | "Templates" | "Forms"

interface HomeProps {
  onNavigate: (key: NavKey) => void
  onNewModule: () => void
  onNewTemplate: () => void
  onOpenModule: (mod: ModuleSummary) => void
  onOpenTemplate: (template: SessionTemplateSummary) => void
  onOpenForm: (form: FormSummary) => void
}

// The admin landing page from the design prototype: a search across the
// libraries, headline counts, shortcuts to create a module or template,
// and links into each library.
export function Home({
  onNavigate,
  onNewModule,
  onNewTemplate,
  onOpenModule,
  onOpenTemplate,
  onOpenForm,
}: HomeProps) {
  const [modules, setModules] = useState<ModuleSummary[] | null>(null)
  const [templates, setTemplates] = useState<SessionTemplateSummary[] | null>(
    null,
  )
  const [forms, setForms] = useState<FormSummary[] | null>(null)
  const [bindingCount, setBindingCount] = useState<number | null>(null)
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<SearchKind>("Modules")

  // Each count is best-effort: one failing library shouldn't blank the page.
  useEffect(() => {
    let cancelled = false
    listModules()
      .then((list) => !cancelled && setModules(list))
      .catch(() => {})
    listSessionTemplates()
      .then((list) => !cancelled && setTemplates(list))
      .catch(() => {})
    listForms()
      .then((list) => !cancelled && setForms(list))
      .catch(() => {})
    listBindings()
      .then((list) => !cancelled && setBindingCount(list.length))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const matches = (name: string, description: string | null) =>
      `${name} ${description ?? ""}`.toLowerCase().includes(q)
    if (kind === "Modules") {
      return (modules ?? [])
        .filter((m) => matches(m.name, m.description))
        .slice(0, 6)
        .map((m) => ({
          id: m.id,
          title: m.name,
          meta: `Module · ${m.hasPublishedVersion ? "Published" : "Not yet published"}`,
          open: () => onOpenModule(m),
        }))
    }
    if (kind === "Templates") {
      return (templates ?? [])
        .filter((t) => matches(t.name, t.description))
        .slice(0, 6)
        .map((t) => ({
          id: t.id,
          title: t.name,
          meta: "Session template",
          open: () => onOpenTemplate(t),
        }))
    }
    return (forms ?? [])
      .filter((f) => matches(f.name, null))
      .slice(0, 6)
      .map((f) => ({
        id: f.id,
        title: f.name,
        meta: "Form",
        open: () => onOpenForm(f),
      }))
  }, [query, kind, modules, templates, forms, onOpenModule, onOpenTemplate, onOpenForm])

  const count = (value: number | null | undefined) => value ?? "–"

  return (
    <main className="admin-page">
      <PageHeading
        eyebrow="FORM ADMINISTRATION"
        title="Build and manage RAWA forms"
        intro="Create reusable modules, assemble session templates and control which record each data-bound field reads and writes."
      />

      <section className="global-search-card">
        <div>
          <p className="eyebrow">SEARCH</p>
          <h2>Find a module, template or form</h2>
        </div>
        <div className="global-search-controls">
          <select
            aria-label="Search type"
            value={kind}
            onChange={(event) => setKind(event.target.value as SearchKind)}
          >
            <option>Modules</option>
            <option>Templates</option>
            <option>Forms</option>
          </select>
          <SearchInput
            className="global-search-input"
            value={query}
            onChange={setQuery}
            label={`Search ${kind.toLowerCase()}`}
            placeholder={`Search ${kind.toLowerCase()} by name`}
          />
        </div>
        {query.trim() && (
          <div className="global-results">
            {results.length > 0 ? (
              results.map((result) => (
                <button type="button" key={result.id} onClick={result.open}>
                  <span>
                    <strong>{result.title}</strong>
                    <small>{result.meta}</small>
                  </span>
                  <ChevronRightIcon />
                </button>
              ))
            ) : (
              <p>No matching {kind.toLowerCase()} found.</p>
            )}
          </div>
        )}
      </section>

      <div className="admin-stats">
        <div>
          <strong>{count(modules?.length)}</strong>
          <span>Active modules</span>
        </div>
        <div>
          <strong>
            {count(modules?.filter((m) => m.hasPublishedVersion).length)}
          </strong>
          <span>Published modules</span>
        </div>
        <div>
          <strong>{count(templates?.length)}</strong>
          <span>Session templates</span>
        </div>
        <div>
          <strong>{count(bindingCount)}</strong>
          <span>Dictionary fields available</span>
        </div>
      </div>

      <div className="home-grid">
        <section className="home-card">
          <div className="home-card-icon">
            <LayersIcon />
          </div>
          <p className="eyebrow">START WITH A REUSABLE MODULE</p>
          <h2>Create a new module</h2>
          <p>
            Choose how often it's completed, then add custom or data-bound
            fields and publish it for use in templates.
          </p>
          <div className="split-actions">
            <button type="button" className="primary" onClick={onNewModule}>
              <PlusIcon />
              New module
            </button>
          </div>
        </section>
        <section className="home-card">
          <div className="home-card-icon template">
            <ClipboardIcon />
          </div>
          <p className="eyebrow">ASSEMBLE A SESSION NOTE</p>
          <h2>Create a new template</h2>
          <p>
            Select published modules, arrange their order and publish the
            template practitioners fill in.
          </p>
          <div className="split-actions">
            <button type="button" className="primary" onClick={onNewTemplate}>
              <PlusIcon />
              New session template
            </button>
          </div>
        </section>
      </div>

      <section className="library-links">
        <button type="button" onClick={() => onNavigate("modules")}>
          <LayersIcon />
          <span>
            <strong>Module library</strong>
            <small>Reusable practitioner and service-delivery modules</small>
          </span>
          <ChevronRightIcon />
        </button>
        <button type="button" onClick={() => onNavigate("session-templates")}>
          <ClipboardIcon />
          <span>
            <strong>Template library</strong>
            <small>Session notes assembled from modules</small>
          </span>
          <ChevronRightIcon />
        </button>
        <button type="button" onClick={() => onNavigate("forms")}>
          <FileTextIcon />
          <span>
            <strong>Form library</strong>
            <small>Standalone forms and their submissions</small>
          </span>
          <ChevronRightIcon />
        </button>
        <button type="button" onClick={() => onNavigate("data-bindings")}>
          <DatabaseIcon />
          <span>
            <strong>Data binding dictionary</strong>
            <small>Fields that read and write source records</small>
          </span>
          <ChevronRightIcon />
        </button>
      </section>

      <section className="integrity-strip">
        <ShieldCheckIcon />
        <div>
          <strong>Data integrity safeguards</strong>
          <p>
            Data-bound fields reach a source record only through the Data
            Binding Service, using stable dictionary keys and the types the
            dictionary allows. Published versions never change: every
            submission keeps the exact version it was captured with.
          </p>
        </div>
      </section>
    </main>
  )
}
