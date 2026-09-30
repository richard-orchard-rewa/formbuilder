import { href } from "../App"
import { ErrorNote, Loading, NoteBadge, PageTitle, useDictionary, BoundText } from "../components/common"
import { Icon } from "../components/Icon"
import { loadCase, useAsync } from "../data"
import { formatDate, formatTime, isToday, todayHeading } from "../format"
import { loadNote, noteKey } from "../notes-store"
import { CASELOAD, PRACTITIONER } from "../seed/notes"
import { hasStarted } from "../session-note"

export function HomeView() {
  const { data: cases, error, loading, reload } = useAsync(() => Promise.all(CASELOAD.map(loadCase)), [])
  const dictionary = useDictionary()

  const sessions = (cases ?? []).flatMap((c) =>
    c.context.sessions.map((s) => ({ session: s, view: c, note: loadNote(noteKey(c.context.caseNumber, s.subject)) })),
  )
  const today = sessions
    .filter((s) => isToday(s.session.start))
    .sort((a, b) => String(a.session.start).localeCompare(String(b.session.start)))
  // A note is due for every session that has happened (or is today) and
  // hasn't been submitted.
  const due = sessions.filter(
    (s) =>
      (hasStarted(s.session) || isToday(s.session.start)) &&
      s.note?.status !== "submitted",
  )
  const clients = new Set((cases ?? []).flatMap((c) => c.context.clients.map((cl) => cl.id)))

  const cards = [
    { label: "Sessions today", n: today.length, d: "booked for today", icon: "calendar", tone: "aqua" },
    { label: "Session notes due", n: due.length, d: "to write or finish", icon: "file", tone: "lemon" },
    { label: "Active cases", n: cases?.length ?? 0, d: "in your caseload", icon: "briefcase", tone: "blue" },
    { label: "Clients", n: clients.size, d: "across your cases", icon: "users", tone: "lavender" },
  ]

  return (
    <div className="screen">
      <PageTitle eyebrow={todayHeading()} title={`Welcome back, ${PRACTITIONER.name.split(" ")[0]}`}>
        <span className="shift">Every record here is read live from (mock) ICIS through the Data Binding Service</span>
      </PageTitle>
      {loading && !cases && <Loading what="your caseload" />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {cases && (
        <div className="homegrid">
          <section className="work">
            <div className="sectitle">
              <div>
                <p>MY WORK</p>
                <h2>What needs your attention</h2>
              </div>
            </div>
            <div className="cardgrid">
              {cards.map((c) => (
                <div className="metric" key={c.label}>
                  <span className={`disc ${c.tone}`}>
                    <Icon name={c.icon} size={28} />
                  </span>
                  <div>
                    <h3>{c.label}</h3>
                    <span className="metric-value">
                      <strong>{c.n}</strong>
                      <small>{c.d}</small>
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="sectitle due-title">
              <div>
                <p>SESSION NOTES</p>
                <h2>Due from you</h2>
              </div>
            </div>
            <div className="list-card">
              {due.length === 0 && <p className="muted pad">All caught up.</p>}
              {due.map(({ session, view, note }) => (
                <a className="row-link" key={session.id} href={href({ page: "session", caseNumber: view.context.caseNumber ?? "", sessionId: session.id })}>
                  <span>
                    <strong>{session.subject}</strong>
                    <small>
                      Case {view.context.caseNumber} · {formatDate(session.start)}
                    </small>
                  </span>
                  <NoteBadge note={note} />
                  <Icon name="chevronRight" />
                </a>
              ))}
            </div>
          </section>
          <section className="schedule">
            <div className="sectitle">
              <div>
                <p>MY SESSIONS</p>
                <h2>Today</h2>
              </div>
            </div>
            {today.length === 0 && <p className="muted">No sessions today.</p>}
            {today.map(({ session, view, note }) => (
              <a key={session.id} className="appt" href={href({ page: "session", caseNumber: view.context.caseNumber ?? "", sessionId: session.id })}>
                <time>{formatTime(session.start)}</time>
                <span>
                  <strong>{session.subject}</strong>
                  <small>
                    <span className="tag aqua">
                      <BoundText dictionary={dictionary} binding="case.program" value={view.values["case.program"]} />
                    </span>
                    Case {view.context.caseNumber}
                  </small>
                </span>
                <NoteBadge note={note} />
                <Icon name="chevronRight" />
              </a>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}
