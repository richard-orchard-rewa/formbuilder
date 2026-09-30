import { href } from "../App"
import { BoundText, ErrorNote, Loading, PageTitle, useDictionary } from "../components/common"
import { Icon } from "../components/Icon"
import { loadCase, useAsync } from "../data"
import { formatDateTime, initials } from "../format"
import { CASELOAD } from "../seed/notes"

export function CasesView() {
  const { data: cases, error, loading, reload } = useAsync(() => Promise.all(CASELOAD.map(loadCase)), [])
  const dictionary = useDictionary()

  return (
    <div className="screen">
      <PageTitle eyebrow="COUNSELLING" title="Cases">
        {cases && <span className="shift">{cases.length} active cases</span>}
      </PageTitle>
      {loading && !cases && <Loading what="your cases" />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {cases && (
        <div className="panel flush">
          <div className="panel-head">
            <div>
              <p>MY CASES</p>
              <h2>Current caseload</h2>
            </div>
            <span className="muted">Each case's clients and sessions come from ICIS, as DBS anchors.</span>
          </div>
          <div className="case-list">
            {cases.map(({ anchor, context, values }) => {
              const next = context.sessions.find((s) => s.status === "scheduled")
              const names = context.clients.map((c) => c.displayName).join(" & ")
              return (
                <a key={anchor.id} className="case-item" href={href({ page: "case", caseNumber: anchor.caseNumber ?? "" })}>
                  <span className="case-avatar">{initials(names)}</span>
                  <span className="case-primary">
                    <strong>{names}</strong>
                    <small>
                      Case {anchor.caseNumber} ·{" "}
                      <BoundText dictionary={dictionary} binding="case.program" value={values["case.program"]} />
                    </small>
                  </span>
                  <span className="tag aqua">
                    <BoundText dictionary={dictionary} binding="case.stage" value={values["case.stage"]} />
                  </span>
                  <span className="case-next">
                    <small>Next session</small>
                    {next ? formatDateTime(next.scheduledStart) : "None booked"}
                  </span>
                  <Icon name="chevronRight" />
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
