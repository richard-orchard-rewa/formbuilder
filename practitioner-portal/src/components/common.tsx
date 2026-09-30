import { useEffect, useState } from "react"
import type { BindingDescriptor, SessionAnchor } from "shared"
import { bindingDictionary } from "../dbs"
import type { SessionNote } from "../seed/types"
import { hasStarted } from "../session-note"
import { useDisplayValue } from "./BoundControl"
import { Icon } from "./Icon"

export function useDictionary() {
  const [dictionary, setDictionary] = useState<Map<string, BindingDescriptor> | null>(null)
  useEffect(() => {
    let live = true
    bindingDictionary().then(
      (d) => live && setDictionary(d),
      () => live && setDictionary(new Map()),
    )
    return () => {
      live = false
    }
  }, [])
  return dictionary
}

export function PageTitle({
  eyebrow,
  title,
  back,
  children,
}: {
  eyebrow: string
  title: string
  back?: { href: string; label: string }
  children?: React.ReactNode
}) {
  return (
    <div className="title">
      <div>
        {back && (
          <a className="back" href={back.href}>
            <Icon name="arrowLeft" size={16} />
            {back.label}
          </a>
        )}
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  )
}

// A bound value as text: a lookup's label, looked up from its live options.
export function BoundText({
  dictionary,
  binding,
  value,
  fallback = "—",
}: {
  dictionary: Map<string, BindingDescriptor> | null
  binding: string
  value: string | null | undefined
  fallback?: string
}) {
  const display = useDisplayValue(dictionary?.get(binding), value ?? null)
  return <>{display ?? fallback}</>
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="loading">
      <span className="spinner" aria-hidden="true" />
      Loading {what} from the Data Binding Service…
    </div>
  )
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <Icon name="alert" />
      <div>
        <strong>Couldn't load this from the Data Binding Service.</strong>
        <p>{error}</p>
        <p className="muted">
          Is the demo running? <code>npm run demo:portal</code> starts the mock ICIS, the DBS and this portal.
        </p>
      </div>
      {onRetry && (
        <button className="button outline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function sessionStatusLabel(session: SessionAnchor) {
  return hasStarted(session) ? "Held" : "Booked"
}

export function NoteBadge({ note }: { note: SessionNote | null }) {
  if (!note) return <span className="tag neutral">No note yet</span>
  return note.status === "submitted" ? (
    <span className="tag good">Note submitted</span>
  ) : (
    <span className="tag warn">Draft note</span>
  )
}
