import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatTime } from './lib/datetime'

// Lab 4 ui-spec.md §3/§4: building blocks shared by the IT Staff and
// Requester dashboards, so both keep one header, list, and state layout.

// ui-spec.md §2.1, §3: title, subtitle, Bangkok-time hint, "Updated" time
// from `generatedAt`, and a Refresh that refetches without a page reload.
export function DashboardHeader({
  subtitle,
  generatedAt,
  refreshing,
  onRefresh,
  children,
}: {
  subtitle: string
  generatedAt?: string
  refreshing: boolean
  onRefresh: () => void
  children?: ReactNode
}) {
  return (
    <div className="zg-actions zg-dashboard-header">
      <div>
        <h1 className="zg-title">Dashboard</h1>
        <p className="zg-helper">{subtitle}</p>
        <p className="zg-helper">
          Times shown in Bangkok time (UTC+7)
          {generatedAt && (
            <>
              {' · '}Updated <time dateTime={generatedAt}>{formatTime(generatedAt)}</time>
            </>
          )}
        </p>
      </div>
      <div className="zg-actions">
        <button
          type="button"
          className="zg-btn zg-btn-tertiary"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing || undefined}
        >
          {!refreshing && <i className="bi bi-arrow-clockwise" aria-hidden="true" />}
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        {children}
      </div>
    </div>
  )
}

// ui-spec.md §9: one <section aria-labelledby> and <h2> per region, with an
// optional one-line empty message (BR-37) and a footer link.
export function DashboardSection({
  id,
  title,
  emptyMessage,
  footer,
  children,
}: {
  id: string
  title: string
  emptyMessage?: string | false
  footer?: { to: string; label: string; ariaLabel?: string }
  children?: ReactNode
}) {
  return (
    <section className="zg-card zg-dashboard-section" aria-labelledby={`${id}-heading`}>
      <h2 className="zg-section-heading" id={`${id}-heading`}>
        {title}
      </h2>
      {emptyMessage ? <p className="zg-helper zg-dashboard-empty">{emptyMessage}</p> : children}
      {footer && (
        <Link to={footer.to} className="zg-dashboard-footer" aria-label={footer.ariaLabel}>
          {footer.label} <i className="bi bi-arrow-right" aria-hidden="true" />
        </Link>
      )}
    </section>
  )
}

// ui-spec.md §3: skeletons at final size, so nothing shifts when data lands.
export function DashboardSkeleton({ cards, lists }: { cards: number; lists: number }) {
  return (
    <div aria-busy="true" data-testid="dashboard-loading">
      <p className="visually-hidden" role="status">
        Loading the dashboard…
      </p>
      <ul className="zg-metric-grid" aria-hidden="true">
        {Array.from({ length: cards }, (_, i) => (
          <li key={i} className="zg-skeleton zg-metric-skeleton" />
        ))}
      </ul>
      <div className="zg-dashboard-columns" aria-hidden="true">
        {Array.from({ length: lists }, (_, i) => (
          <div key={i} className="zg-skeleton zg-list-skeleton" />
        ))}
      </div>
    </div>
  )
}

// ui-spec.md §3: the safe error with Retry. `stale` keeps the last good
// numbers on screen and says they may be out of date.
export function DashboardError({ onRetry, stale }: { onRetry: () => void; stale: boolean }) {
  return (
    <div className="zg-error zg-dashboard-error" role="alert">
      <span>
        {stale
          ? "We couldn't refresh your dashboard. Showing the last loaded numbers."
          : "We couldn't load your dashboard."}
      </span>
      <button type="button" className="zg-btn zg-btn-secondary zg-btn-sm" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
