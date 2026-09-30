import { useEffect, useState } from "react"
import { DevPanel } from "./components/DevPanel"
import { Icon } from "./components/Icon"
import { resetNotes } from "./notes-store"
import { resetTemplateNotes } from "./template-notes-store"
import { PRACTITIONER } from "./seed/notes"
import { CasesView } from "./views/CasesView"
import { CaseView } from "./views/CaseView"
import { HomeView } from "./views/HomeView"
import { SessionView } from "./views/SessionView"
import { TemplateNoteView } from "./views/TemplateNoteView"

// Routes, by hash: #/, #/cases, #/case/<case number>[/<tab>],
// #/case/<case number>/session/<session anchor ID>[/template/<form-builder template ID>]. Case numbers are what staff quote; a
// session is identified by its DBS-issued anchor ID.
export type Route =
  | { page: "home" }
  | { page: "cases" }
  | { page: "case"; caseNumber: string; tab?: string }
  | { page: "session"; caseNumber: string; sessionId: string }
  | { page: "template-note"; caseNumber: string; sessionId: string; templateId: string }

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent)
  if (parts[0] === "cases") return { page: "cases" }
  if (parts[0] === "case" && parts[1] && parts[2] === "session" && parts[3] && parts[4] === "template" && parts[5]) {
    return { page: "template-note", caseNumber: parts[1], sessionId: parts[3], templateId: parts[5] }
  }
  if (parts[0] === "case" && parts[1] && parts[2] === "session" && parts[3]) {
    return { page: "session", caseNumber: parts[1], sessionId: parts[3] }
  }
  if (parts[0] === "case" && parts[1]) return { page: "case", caseNumber: parts[1], tab: parts[2] }
  return { page: "home" }
}

export const href = (route: Route) => {
  switch (route.page) {
    case "home":
      return "#/"
    case "cases":
      return "#/cases"
    case "case":
      return `#/case/${encodeURIComponent(route.caseNumber)}${route.tab ? `/${route.tab}` : ""}`
    case "session":
      return `#/case/${encodeURIComponent(route.caseNumber)}/session/${route.sessionId}`
    case "template-note":
      return `#/case/${encodeURIComponent(route.caseNumber)}/session/${route.sessionId}/template/${encodeURIComponent(route.templateId)}`
  }
}

export const go = (route: Route) => {
  window.location.hash = href(route)
}

const NAV = [
  { page: "home" as const, label: "Home", icon: "home" },
  { page: "cases" as const, label: "Cases", icon: "briefcase" },
]

export function App() {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash))
      setMenuOpen(false)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const section = route.page === "home" ? "home" : "cases"

  return (
    <div className="shell">
      <aside className={menuOpen ? "side open" : "side"}>
        <a className="brand" href="#/" aria-label="Relationships Australia WA home">
          <img className="mark-logo" src="/brand/rawa-brandmark-new.svg" alt="" />
          <img className="full-logo" src="/brand/rawa-logo-new.svg" alt="Relationships Australia WA" />
        </a>
        <nav>
          {NAV.map((item) => (
            <a key={item.page} href={href({ page: item.page })} className={section === item.page ? "active" : ""}>
              <Icon name={item.icon} size={22} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <button
          className="reset-notes"
          onClick={() => {
            if (window.confirm("Put the portal's session notes back to the seeded ones? (ICIS data isn't touched.)")) {
              resetNotes()
              resetTemplateNotes()
              window.location.reload()
            }
          }}
        >
          <Icon name="refresh" size={18} />
          <span>Reset portal notes</span>
        </button>
      </aside>
      {menuOpen && <button className="menu-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name="menu" size={24} />
          </button>
          <div className="search">
            <Icon name="search" />
            <input placeholder="Search authorised clients, case number…" aria-label="Search" disabled />
          </div>
          <span className="mock-tag" title="Made-up data, served by the mock ICIS through the Data Binding Service">
            MOCK · demo data
          </span>
          <div className="profile">
            <span>
              <small>{PRACTITIONER.role}</small>
              {PRACTITIONER.name}
            </span>
            <b>{PRACTITIONER.initials}</b>
          </div>
        </header>
        <main>
          {route.page === "home" && <HomeView />}
          {route.page === "cases" && <CasesView />}
          {route.page === "case" && <CaseView key={route.caseNumber} caseNumber={route.caseNumber} tab={route.tab} />}
          {route.page === "session" && <SessionView key={route.sessionId} caseNumber={route.caseNumber} sessionId={route.sessionId} />}
          {route.page === "template-note" && (
            <TemplateNoteView
              key={`${route.sessionId}/${route.templateId}`}
              caseNumber={route.caseNumber}
              sessionId={route.sessionId}
              templateId={route.templateId}
            />
          )}
        </main>
      </div>
      <DevPanel />
    </div>
  )
}
