import { useState } from 'react'
import { RoleBadge, StatusBadge } from './badges'
import { formatDateTime } from './lib/datetime'
import type { StatusHistoryEntry } from './types'

const COLLAPSED_COUNT = 10

// Lab 4 ui-spec.md §5.3 (FR-09, BR-22): the read-only Status History shared
// by both Ticket Detail screens. Oldest first; the latest 10 by default with
// a Show all toggle. There is no edit or delete control.
function StatusHistory({
  entries,
  failed,
  onRetry,
}: {
  entries: StatusHistoryEntry[] | null
  failed: boolean
  onRetry: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const shown =
    entries && !showAll && entries.length > COLLAPSED_COUNT
      ? entries.slice(-COLLAPSED_COUNT)
      : entries

  return (
    <section
      className="zg-card"
      style={{ marginTop: 'var(--zg-space-5)' }}
      aria-labelledby="status-history-heading"
    >
      <h2 className="zg-section-heading" id="status-history-heading">
        Status History
      </h2>

      {failed ? (
        <div style={{ marginTop: 'var(--zg-space-4)' }}>
          <p className="zg-error-message" role="alert">
            Unable to load the status history.
          </p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : shown === null ? (
        <p className="zg-skeleton" style={{ marginTop: 'var(--zg-space-4)' }}>
          Loading status history…
        </p>
      ) : shown.length === 0 ? (
        <p className="zg-helper" style={{ marginTop: 'var(--zg-space-4)' }}>
          No status changes recorded yet.
        </p>
      ) : (
        <>
          <ol className="zg-history" data-testid="status-history">
            {shown.map((entry) => (
              <li key={entry.id} className="zg-history-entry">
                {entry.fromStatus === null ? (
                  <span>
                    Created as <StatusBadge status={entry.toStatus} />
                  </span>
                ) : (
                  <span className="zg-history-change">
                    <StatusBadge status={entry.fromStatus} />
                    <span aria-hidden="true">→</span>
                    <span className="zg-visually-hidden">to</span>
                    <StatusBadge status={entry.toStatus} />
                  </span>
                )}
                <span>
                  · <strong>{entry.changedBy.name}</strong>{' '}
                  <RoleBadge role={entry.changedBy.role} />
                </span>
                <span className="zg-helper">
                  · <time dateTime={entry.changedAt}>{formatDateTime(entry.changedAt)}</time>
                </span>
              </li>
            ))}
          </ol>
          {entries && entries.length > COLLAPSED_COUNT && (
            <button
              type="button"
              className="zg-btn zg-btn-tertiary"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Show latest 10' : `Show all (${entries.length})`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default StatusHistory
