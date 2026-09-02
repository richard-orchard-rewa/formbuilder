import type { SubmissionHistory } from "shared"

interface SubmissionHistoryListProps {
  versions: SubmissionHistory[]
  // Opens one previous version read-only (US-6.4). Optional -- the inline
  // list on the edit screen doesn't offer this, only the dedicated history
  // screen does.
  onSelect?: (versionId: string) => void
}

// Renders the previous versions of a submission as a timeline, most recent
// edit first (US-6.3): when it was superseded and who did it. `versions` is
// the full lifetime list returned by getSubmissionHistory, including the
// current still-live entry (`activeTo: null`) -- that one isn't a "previous
// version" so it's excluded here.
export function SubmissionHistoryList({
  versions,
  onSelect,
}: SubmissionHistoryListProps) {
  const previousVersions = versions
    .filter(
      (version): version is SubmissionHistory & { activeTo: string } =>
        version.activeTo !== null,
    )
    .reverse()

  if (previousVersions.length === 0) {
    return <p>No edits yet.</p>
  }

  return (
    <ul>
      {previousVersions.map((version) => {
        const label = (
          <>
            {new Date(version.activeTo).toLocaleString()}
            {version.editedBy && ` — ${version.editedBy}`}
          </>
        )
        return (
          <li key={version.id}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(version.id)}>
                {label}
              </button>
            ) : (
              label
            )}
          </li>
        )
      })}
    </ul>
  )
}
