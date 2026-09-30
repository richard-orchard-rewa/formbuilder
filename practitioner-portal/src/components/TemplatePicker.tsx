import { useEffect, useState } from "react"
import { href } from "../App"
import { listPublishedTemplates, type PublishedTemplate } from "../formbuilder"
import { loadPointer } from "../template-notes-store"
import { Icon } from "./Icon"

// Session templates built in form-builder and published, offered for this
// session. A session with a note already submitted from one links to it.
export function TemplatePicker({
  caseNumber,
  sessionId,
  noteKey,
}: {
  caseNumber: string
  sessionId: string
  noteKey: string
}) {
  const [templates, setTemplates] = useState<PublishedTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pointer = loadPointer(noteKey)

  useEffect(() => {
    let live = true
    listPublishedTemplates().then(
      (t) => live && setTemplates(t),
      (e: Error) => live && setError(e.message),
    )
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="panel template-picker">
      <div className="panel-head">
        <div>
          <p>SESSION TEMPLATES FROM FORM-BUILDER</p>
          <h2>Write this note with a template</h2>
        </div>
      </div>
      {pointer && (
        <p>
          A note for this session was submitted with <strong>{pointer.templateName}</strong>.{" "}
          <a className="button ghost" href={href({ page: "template-note", caseNumber, sessionId, templateId: pointer.templateId })}>
            View note <Icon name="chevronRight" size={16} />
          </a>
        </p>
      )}
      {!pointer && error && <p className="error-text">Couldn't load templates: {error}. Is form-builder's server running?</p>}
      {!pointer && !error && templates === null && <p className="muted">Loading templates…</p>}
      {!pointer && templates?.length === 0 && (
        <p className="muted">No session templates are published yet. Build and publish one in form-builder.</p>
      )}
      {!pointer && templates && templates.length > 0 && (
        <ul className="template-list">
          {templates.map(({ template, version }) => (
            <li key={template.id}>
              <span>
                <strong>{template.name}</strong>
                <small>
                  {template.description ? `${template.description} · ` : ""}
                  {version.modules.length} module{version.modules.length === 1 ? "" : "s"} · version {version.version}
                </small>
              </span>
              <a className="button outline" href={href({ page: "template-note", caseNumber, sessionId, templateId: template.id })}>
                Use this template <Icon name="chevronRight" size={16} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
