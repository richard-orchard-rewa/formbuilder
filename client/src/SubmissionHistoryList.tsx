import type { SubmissionHistory } from "shared"

interface SubmissionHistoryListProps {
  versions: SubmissionHistory[]
}

// Renders the previous versions of a submission as a timeline, most recent
// edit first (US-6.3): when it was superseded and who did it. `versions` is
// the full lifetime list returned by getSubmissionHistory, including the
// current still-live entry (`activeTo: null`) -- that one isn't a "previous
// version" so it's excluded here.
export function SubmissionHistoryList({ versions }: SubmissionHistoryListProps) {
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
      {previousVersions.map((version) => (
        <li key={version.id}>
          {new Date(version.activeTo).toLocaleString()}
          {version.editedBy && ` — ${version.editedBy}`}
        </li>
      ))}
    </ul>
  )
}
