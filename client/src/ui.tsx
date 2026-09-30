import { useEffect, useId, useState, type ReactNode } from "react"
import {
  ArrowLeftIcon,
  CheckIcon,
  CloseIcon,
  LayersIcon,
  SearchIcon,
} from "./icons.js"

// Building blocks shared by the admin screens (lists, builders, home),
// following the design prototype's recipes -- see App.css for the styles.

export function PageHeading({
  eyebrow,
  title,
  intro,
  actions,
}: {
  eyebrow: string
  title: string
  intro?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className={"page-heading" + (actions ? " with-actions" : "")}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  )
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function BackLink({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="back-link" onClick={onClick}>
      <ArrowLeftIcon />
      {children}
    </button>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <LayersIcon />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label = "Search",
  className = "list-search",
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label?: string
  className?: string
}) {
  return (
    <label className={className}>
      <SearchIcon />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

// A modal dialog: a backdrop plus a card, closed with Escape or the
// backdrop. Kept dependency-free rather than pulling in a dialog library.
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  wide?: boolean
}) {
  const titleId = useId()
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={"modal" + (wide ? " modal--wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        <div className="modal__footer">{footer}</div>
      </div>
    </div>
  )
}

// A short-lived confirmation message, e.g. after publishing.
export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 3500)
    return () => window.clearTimeout(timer)
  }, [message])
  const toast = message ? (
    <div className="fas-toast" role="status">
      <CheckIcon />
      {message}
    </div>
  ) : null
  return [toast, setMessage] as const
}

export interface WizardStep {
  label: string
  complete?: boolean
  disabled?: boolean
}

export function WizardSteps({
  steps,
  current,
  onSelect,
}: {
  steps: WizardStep[]
  current: number
  onSelect: (index: number) => void
}) {
  return (
    <nav className="wizard-steps" aria-label="Steps">
      {steps.map((step, index) => (
        <WizardStepButton
          key={step.label}
          step={step}
          index={index}
          current={current}
          onSelect={onSelect}
          isLast={index === steps.length - 1}
        />
      ))}
    </nav>
  )
}

function WizardStepButton({
  step,
  index,
  current,
  onSelect,
  isLast,
}: {
  step: WizardStep
  index: number
  current: number
  onSelect: (index: number) => void
  isLast: boolean
}) {
  const state =
    index === current ? "active" : step.complete ? "complete" : undefined
  return (
    <>
      <button
        type="button"
        className={state}
        aria-current={index === current ? "step" : undefined}
        disabled={step.disabled}
        onClick={() => onSelect(index)}
      >
        <span>{state === "complete" ? <CheckIcon /> : index + 1}</span>
        {step.label}
      </button>
      {!isLast && <div />}
    </>
  )
}
