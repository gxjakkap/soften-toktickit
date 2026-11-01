import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Lab 4 ui-spec.md §11 (FR-19): the one set of feedback states every screen
// uses, so forbidden, not-found, failure, and empty read and look the same
// everywhere. Copy shown here is either fixed text or an api-spec.md §0.2
// `message`, which is always safe to display.

// Lab 3 ui-spec.md §5-§7 (specification.md §12-14): a role reaching a route
// it isn't permitted shows this full-page state, never a silent redirect.
export function Forbidden({ testId, homeTo }: { testId: string; homeTo: string }) {
  return (
    <section className="zg-feedback zg-forbidden" data-testid={testId}>
      <i className="bi bi-shield-lock zg-feedback-icon" aria-hidden="true" />
      <h1 className="zg-feedback-title">You don't have access to this page.</h1>
      <Link to={homeTo} className="zg-btn zg-btn-secondary">
        Back to your home page
      </Link>
    </section>
  )
}

// Lab 4 ui-spec.md §11: the Lab 2 "Ticket not found" card, with a link back
// to the role's list and never a blank page.
export function NotFound({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  return (
    <section className="zg-card zg-feedback" data-testid="not-found">
      <i className="bi bi-search zg-feedback-icon" aria-hidden="true" />
      <h1 className="zg-feedback-title">Ticket not found.</h1>
      <Link to={backTo} className="zg-btn zg-btn-secondary">
        {backLabel}
      </Link>
    </section>
  )
}

// The safe failure: a fixed message plus one recovery action (Retry, or
// Clear filters for a bad drill-down link).
export function ErrorState({
  message,
  onAction,
  actionLabel = 'Retry',
}: {
  message: string
  onAction: () => void
  actionLabel?: string
}) {
  return (
    <div className="zg-error-state">
      <p className="zg-error" role="alert">
        {message}
      </p>
      <button type="button" className="zg-btn zg-btn-secondary" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}

// Empty (nothing exists yet) and no-results (filters match nothing) share
// one look; the caller passes the action, if any.
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="zg-callout zg-feedback zg-empty-state">
      {icon && <i className={`bi ${icon} zg-feedback-icon`} aria-hidden="true" />}
      <p className="zg-feedback-title">{title}</p>
      {children}
    </div>
  )
}
