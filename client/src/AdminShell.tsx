import { useState, type ComponentType, type ReactNode, type SVGProps } from "react"
import {
  ClipboardIcon,
  CloseIcon,
  DatabaseIcon,
  FileTextIcon,
  HomeIcon,
  LayersIcon,
  MenuIcon,
  SettingsIcon,
} from "./icons.js"

export type NavKey =
  | "home"
  | "modules"
  | "session-templates"
  | "forms"
  | "data-bindings"

const NAV: {
  key: NavKey
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}[] = [
  { key: "home", label: "Home", Icon: HomeIcon },
  { key: "modules", label: "Modules", Icon: LayersIcon },
  { key: "session-templates", label: "Session templates", Icon: ClipboardIcon },
  { key: "forms", label: "Forms", Icon: FileTextIcon },
  { key: "data-bindings", label: "Data bindings", Icon: DatabaseIcon },
]

// The admin frame from the design prototype: a collapsible navy sidebar
// (icons only until opened) and a sticky top bar, with the current view
// rendered in the light content area beside them.
export function AdminShell({
  active,
  onNavigate,
  children,
}: {
  active: NavKey | null
  onNavigate: (key: NavKey) => void
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  function go(key: NavKey) {
    setMenuOpen(false)
    onNavigate(key)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="fas-shell">
      <aside className={"fas-sidebar" + (menuOpen ? " open" : "")}>
        <button
          type="button"
          className="fas-brand"
          onClick={() => go("home")}
          aria-label="Relationships Australia WA home"
        >
          <img src="/brand/rawa-brandmark-new.svg" alt="" />
          <span>
            Relationships
            <br />
            Australia WA
          </span>
        </button>
        <button
          type="button"
          className="fas-menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
          <span>{menuOpen ? "Close menu" : "Open menu"}</span>
        </button>
        <p>FORM ADMINISTRATION</p>
        <nav aria-label="Form administration">
          {NAV.map(({ key, label, Icon }) => (
            <button
              type="button"
              key={key}
              className={active === key ? "active" : undefined}
              aria-current={active === key ? "page" : undefined}
              onClick={() => go(key)}
              title={label}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="fas-sidebar-bottom">
          <SettingsIcon />
          <span>System administrator</span>
        </div>
      </aside>
      {menuOpen && (
        <button
          type="button"
          className="fas-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="fas-main">
        <header className="fas-topbar">
          <button
            type="button"
            className="mobile-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </button>
          <img
            className="mobile-logo"
            src="/brand/rawa-logo-new.svg"
            alt="Relationships Australia WA"
          />
          <div className="topbar-title">
            <strong>Form Administration System</strong>
            <span>System administration</span>
          </div>
          <span className="prototype-tag">PROTOTYPE</span>
          <span className="admin-avatar" aria-hidden="true">
            SA
          </span>
        </header>
        <div className="fas-content">{children}</div>
      </div>
    </div>
  )
}
