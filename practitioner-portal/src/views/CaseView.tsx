import type { BindingDescriptor, ClientAnchor } from "shared"
import { href } from "../App"
import {
  BoundText,
  ErrorNote,
  Loading,
  NoteBadge,
  PageTitle,
  sessionStatusLabel,
  useDictionary,
} from "../components/common"
import { Icon } from "../components/Icon"
import { loadCase, useAsync } from "../data"
import { dbs } from "../dbs"
import { formatDateTime, initials } from "../format"
import { loadNote, noteKey } from "../notes-store"
import { moduleById } from "../seed/modules"
import { boundFields } from "../session-note"

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sessions", label: "Sessions" },
  { id: "clients", label: "Case participants" },
]

// The client bindings shown on a client's record: the Client details
// module's, as far as the DBS has them published.
const CLIENT_BINDINGS = boundFields(moduleById("client-details")).map((f) => f.binding)

function ClientRecord({ client, primary, dictionary }: { client: ClientAnchor; primary: boolean; dictionary: Map<string, BindingDescriptor> }) {
  const keys = CLIENT_BINDINGS.filter((k) => dictionary.has(k))
  const { data, error } = useAsync(() => dbs.resolve({ client: client.id }, keys), [client.id, keys.join()])
  return (
    <div className="panel client-record">
      <div className="person">
        <b>{initials(client.displayName)}</b>
        <span>
          <strong>{client.displayName}</strong>
          <small>
            {primary ? "Primary client" : "Case participant"} · Client number {client.clientNumber}
          </small>
        </span>
        <span className="icis-badge read">
          <Icon name="lock" size={12} />
          From ICIS
        </span>
      </div>
      {error && <p className="error-text">{error}</p>}
      {data && (
        <dl className="record-dl">
          {keys.map((key) => (
            <div key={key}>
              <dt>{dictionary.get(key)!.label}</dt>
              <dd>
                <BoundText dictionary={dictionary} binding={key} value={data.values[key]} fallback="Not recorded" />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="muted small">
        Edited in a session note's <strong>Client details</strong> module; changes are saved to ICIS on submit.
      </p>
    </div>
  )
}

export function CaseView({ caseNumber, tab = "overview" }: { caseNumber: string; tab?: string }) {
  const { data, error, loading, reload } = useAsync(() => loadCase(caseNumber), [caseNumber])
  const dictionary = useDictionary()

  if (loading && !data) return <div className="screen"><Loading what={`case ${caseNumber}`} /></div>
  if (error || !data) return <div className="screen"><ErrorNote error={error ?? "Not found"} onRetry={reload} /></div>

  const { anchor, context, values } = data
  const next = context.sessions.find((s) => s.status === "scheduled")
  const tabHref = (id: string) => href({ page: "case", caseNumber, tab: id === "overview" ? undefined : id })
  const sessions = context.sessions.map((s) => ({ session: s, note: loadNote(noteKey(anchor.caseNumber, s.subject)) }))

  return (
    <div className="screen">
      <PageTitle eyebrow={`COUNSELLING · CASE ${anchor.caseNumber}`} title={context.clients.map((c) => c.displayName).join(" & ")} back={{ href: href({ page: "cases" }), label: "Cases" }} />
      <div className="casebar">
        <div className="active-dot">
          <i />
          Active case
        </div>
        <div>
          <small>Program</small>
          <BoundText dictionary={dictionary} binding="case.program" value={values["case.program"]} />
        </div>
        <div>
          <small>Location</small>
          <BoundText dictionary={dictionary} binding="case.location" value={values["case.location"]} />
        </div>
        <div>
          <small>Case stage</small>
          <BoundText dictionary={dictionary} binding="case.stage" value={values["case.stage"]} />
        </div>
        <div>
          <small>Referral source</small>
          <BoundText dictionary={dictionary} binding="case.referralSource" value={values["case.referralSource"]} />
        </div>
        <div>
          <small>Next booking</small>
          {next ? formatDateTime(next.scheduledStart) : "None"}
        </div>
      </div>

      <nav className="tabs" aria-label="Case sections">
        {TABS.map((t) => (
          <a key={t.id} href={tabHref(t.id)} className={tab === t.id ? "active" : ""} aria-current={tab === t.id ? "page" : undefined}>
            {t.label}
            {t.id === "sessions" && <b>{context.sessions.length}</b>}
            {t.id === "clients" && <b>{context.clients.length}</b>}
          </a>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="casegrid">
          <div className="column">
            {next && (
              <div className="panel current">
                <div className="panel-head">
                  <div>
                    <p>NEXT SESSION</p>
                    <h2>{next.subject}</h2>
                  </div>
                  <NoteBadge note={loadNote(noteKey(anchor.caseNumber, next.subject))} />
                </div>
                <div className="summary">
                  <span>
                    <Icon name="clock" size={16} />
                    {formatDateTime(next.scheduledStart)}
                  </span>
                  <span>
                    <Icon name="users" size={16} />
                    {context.clients.map((c) => c.displayName).join(" & ")}
                  </span>
                </div>
                <a className="button" href={href({ page: "session", sessionId: next.id })}>
                  Open session note <Icon name="chevronRight" size={16} />
                </a>
              </div>
            )}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p>CASE PARTICIPANTS</p>
                  <h2>People in this case</h2>
                </div>
                <a className="link-button" href={tabHref("clients")}>
                  View details
                </a>
              </div>
              <div className="participant-list">
                {context.clients.map((c) => (
                  <div className="person" key={c.id}>
                    <b>{initials(c.displayName)}</b>
                    <span>
                      <strong>{c.displayName}</strong>
                      <small>
                        {c.primary ? "Primary client" : "Case participant"} · Client number {c.clientNumber}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="column">
            <div className="panel explain">
              <p className="over">HOW THIS PAGE IS BUILT</p>
              <h2>One case, three kinds of anchor</h2>
              <ul>
                <li>
                  <strong>Case</strong> — <code>GET /anchors/case?caseNumber={anchor.caseNumber}</code> gives the DBS's ID for
                  it; <code>GET /anchors/case/:id</code> its clients and sessions.
                </li>
                <li>
                  <strong>Case bar</strong> — one <code>POST /resolve</code> of the case bindings (program, location,
                  stage, referral source), as option codes the portal labels from each binding's options.
                </li>
                <li>
                  <strong>Clients</strong> and <strong>sessions</strong> each have their own DBS anchor ID; a session
                  note resolves against all of them.
                </li>
              </ul>
              <p className="muted small">Open the DBS traffic panel (bottom right) to see each call.</p>
            </div>
          </div>
        </div>
      )}

      {tab === "sessions" && (
        <div className="panel flush">
          <div className="panel-head">
            <div>
              <p>BOOKED SESSIONS</p>
              <h2>Past, current and future sessions</h2>
            </div>
            <span className="tag neutral">{context.sessions.length} sessions</span>
          </div>
          <div className="session-list">
            {sessions.map(({ session, note }) => (
              <div className="session-row" key={session.id}>
                <span>
                  <strong>{session.subject}</strong>
                  <small>{sessionStatusLabel(session)}</small>
                </span>
                <span>
                  <small>Date booked</small>
                  {formatDateTime(session.scheduledStart)}
                </span>
                <span>
                  <small>Session note</small>
                  <NoteBadge note={note} />
                </span>
                <a className="button ghost" href={href({ page: "session", sessionId: session.id })}>
                  {note?.status === "submitted" ? "View note" : "Open session note"} <Icon name="chevronRight" size={16} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "clients" && dictionary && (
        <div className="client-grid">
          {context.clients.map((c) => (
            <ClientRecord key={c.id} client={c} primary={c.primary} dictionary={dictionary} />
          ))}
        </div>
      )}
    </div>
  )
}
