import { useEffect, useState, useSyncExternalStore } from "react"
import type { BindingDescriptor } from "shared"
import { bindingDictionary, clearDbsCalls, dbsCalls, onDbsCall, type DbsCall } from "../dbs"
import { Icon } from "./Icon"

let version = 0
const subscribe = (listener: () => void) =>
  onDbsCall(() => {
    version++
    listener()
  })

function useCalls() {
  useSyncExternalStore(subscribe, () => version)
  return dbsCalls()
}

function Json({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>
}

function CallRow({ call }: { call: DbsCall }) {
  const ok = call.status !== null && call.status < 400
  return (
    <details className="call">
      <summary>
        <span className={`method ${call.method.toLowerCase()}`}>{call.method}</span>
        <span className="call-main">
          <strong>{call.summary}</strong>
          <code>{call.path}</code>
        </span>
        <span className={ok ? "status ok" : "status bad"}>{call.status ?? "…"}</span>
        <span className="ms">{call.ms} ms</span>
      </summary>
      {call.body !== undefined && (
        <>
          <p className="over">REQUEST</p>
          <Json value={call.body} />
        </>
      )}
      <p className="over">RESPONSE</p>
      <Json value={call.response} />
    </details>
  )
}

const ANCHOR_ORDER = ["case", "session", "participant", "client"]

function Dictionary() {
  const [list, setList] = useState<BindingDescriptor[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    bindingDictionary().then(
      (d) => setList([...d.values()]),
      (e: Error) => setError(e.message),
    )
  }, [])
  if (error) return <p className="dev-note">{error}</p>
  if (!list) return <p className="dev-note">Loading…</p>
  return (
    <div className="dictionary">
      <p className="dev-note">
        Published bindings the portal's modules can use, grouped by anchor. The portal only knows these keys — the
        ICIS table and column behind each one live in the Data Binding Service.
      </p>
      {ANCHOR_ORDER.map((anchor) => (
        <section key={anchor}>
          <p className="over">{anchor.toUpperCase()}</p>
          <table>
            <tbody>
              {list
                .filter((d) => d.anchor === anchor)
                .map((d) => (
                  <tr key={d.key}>
                    <td>
                      <code>{d.key}</code>
                    </td>
                    <td>{d.label}</td>
                    <td>{d.operations?.commit.strategy}</td>
                    <td>{d.access === "read" ? "display only" : "editable"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

// A developer's view of what the portal is doing with the Data Binding
// Service: every call, and the dictionary it's working from.
export function DevPanel() {
  const calls = useCalls()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"calls" | "dictionary">("calls")
  const [showKeys, setShowKeys] = useState(false)

  useEffect(() => {
    document.body.classList.toggle("show-bindings", showKeys)
  }, [showKeys])

  return (
    <>
      <button className="dev-fab" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="code" size={16} />
        DBS traffic <b>{calls.length}</b>
      </button>
      {open && (
        <aside className="dev-panel" aria-label="Data Binding Service traffic">
          <div className="dev-head">
            <div>
              <p className="over">FOR DEVELOPERS</p>
              <h2>Data Binding Service</h2>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={showKeys} onChange={(e) => setShowKeys(e.target.checked)} />
            Show binding keys on fields
          </label>
          <div className="dev-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "calls"} onClick={() => setTab("calls")}>
              Calls ({calls.length})
            </button>
            <button role="tab" aria-selected={tab === "dictionary"} onClick={() => setTab("dictionary")}>
              Dictionary
            </button>
          </div>
          {tab === "calls" ? (
            <div className="calls">
              <div className="dev-note">
                Newest first. Every call goes to the DBS through the portal's <code>/dbs</code> relay; the DBS's
                own calls to ICIS are in the mock ICIS's <strong>API log</strong>.
                <button className="link-button" onClick={clearDbsCalls}>
                  Clear
                </button>
              </div>
              {calls.map((c) => (
                <CallRow key={c.id} call={c} />
              ))}
            </div>
          ) : (
            <Dictionary />
          )}
        </aside>
      )}
    </>
  )
}
