import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Lab 4 ui-spec.md §2.4 (BR-37, AC-30, AC-31): the whole card is one link
// to the server-supplied drill-down, named "<Label>: <value>. View tickets".
// A zero value still shows `0` with the metric's empty helper, and the link
// stays active. Shared by the IT Staff and Requester dashboards.
function MetricCard({
  label,
  value,
  to,
  emptyHelper,
  secondary,
  icon,
  attention = false,
}: {
  label: string
  value: number
  to: string
  emptyHelper: string
  secondary?: ReactNode
  icon?: string
  attention?: boolean
}) {
  const helperId = useId()
  const helper = value === 0 ? emptyHelper : secondary

  return (
    <Link
      to={to}
      className={`zg-card zg-metric-card${attention ? ' is-attention' : ''}`}
      aria-label={`${label}: ${value}. View tickets`}
      aria-describedby={helper ? helperId : undefined}
    >
      <span className="zg-label">
        {icon && <i className={`bi ${icon}`} aria-hidden="true" />} {label}
      </span>
      <span className="zg-metric-value">{value}</span>
      {helper && (
        <span id={helperId} className="zg-helper">
          {helper}
        </span>
      )}
      <span className="zg-metric-link" aria-hidden="true">
        View tickets <i className="bi bi-arrow-right" />
      </span>
    </Link>
  )
}

export default MetricCard
