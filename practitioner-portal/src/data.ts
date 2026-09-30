import { useCallback, useEffect, useState } from "react"
import type { BoundValues, CaseAnchor, CaseContext } from "shared"
import { dbs } from "./dbs"

// A case as the portal lists it: its anchor graph (clients, sessions) and
// the case-level bound values it shows in headers.
export interface CaseView {
  anchor: CaseAnchor
  context: CaseContext
  values: BoundValues
}

export const CASE_HEADER_BINDINGS = ["case.program", "case.location", "case.stage", "case.referralSource"]

export async function loadCase(caseNumber: string): Promise<CaseView> {
  const anchor = await dbs.findCase(caseNumber)
  const [context, resolved] = await Promise.all([
    dbs.caseContext(anchor.id),
    dbs.resolve({ case: anchor.id }, CASE_HEADER_BINDINGS),
  ])
  return { anchor, context, values: resolved.values }
}

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const run = useCallback(load, deps)
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    run().then(
      (data) => setState({ data, loading: false }),
      (e: Error) => setState({ error: e.message, loading: false }),
    )
  }, [run])
  useEffect(() => {
    let live = true
    setState({ loading: true })
    run().then(
      (data) => live && setState({ data, loading: false }),
      (e: Error) => live && setState({ error: e.message, loading: false }),
    )
    return () => {
      live = false
    }
  }, [run])
  return { ...state, reload }
}
