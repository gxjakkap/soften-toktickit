import { Link } from 'react-router-dom'
import { fetchRequesterDashboard } from './apiClient'
import { StatusBadge } from './badges'
import {
  DashboardError,
  DashboardHeader,
  DashboardSection,
  DashboardSkeleton,
} from './DashboardParts'
import { Forbidden } from './FeedbackState'
import { formatDateTime } from './lib/datetime'
import { roleHomePath } from './lib/role-routes'
import MetricCard from './MetricCard'
import { useAuth } from './useAuth'
import { useDashboard } from './useDashboard'
import type {
  RequesterDashboard as RequesterDashboardData,
  RequesterDashboardTicketItem,
} from './types'

const CreateTicketLink = ({ className }: { className: string }) => (
  <Link to="/tickets/new" className={className}>
    <i className="bi bi-plus-lg" aria-hidden="true" />
    Create Ticket
  </Link>
)

// Lab 4 ui-spec.md §3 (FR-12, FR-15, AC-02, AC-30, AC-31, AC-34): the
// Requester's dashboard. Every value and drill-down comes from
// GET /api/dashboard/requester, which the server scopes to the session
// (BR-31); the screen computes nothing itself and calls no staff endpoint.
function RequesterDashboard() {
  const { user } = useAuth()
  const { data, loading, failed, forbidden, refresh } = useDashboard(fetchRequesterDashboard)

  // /dashboard renders by role, so this only shows if the API ever says 403.
  if (forbidden) {
    return (
      <Forbidden testId="dashboard-forbidden" homeTo={user ? roleHomePath(user.role) : '/login'} />
    )
  }

  return (
    <div>
      <DashboardHeader
        subtitle={`Welcome back, ${user?.name}.`}
        generatedAt={data?.generatedAt}
        refreshing={loading}
        onRefresh={refresh}
      >
        {/* ui-spec.md §3: Create Ticket top-right, as on My Tickets, which
            also drops it while the whole-account empty state offers one. */}
        {data?.hasAnyTickets !== false && (
          <CreateTicketLink className="zg-btn zg-btn-primary zg-btn-sm" />
        )}
      </DashboardHeader>
      {failed && <DashboardError onRetry={refresh} stale={data !== null} />}
      {data ? (
        <RequesterDashboardBody data={data} />
      ) : (
        loading && <DashboardSkeleton cards={3} lists={2} />
      )}
    </div>
  )
}

function RequesterDashboardBody({ data }: { data: RequesterDashboardData }) {
  // BR-40: a Requester with no Tickets at all gets one empty state in place
  // of the cards and lists.
  if (!data.hasAnyTickets) {
    return (
      <section className="zg-card zg-dashboard-blank" aria-labelledby="no-tickets-heading">
        <i className="bi bi-inbox" aria-hidden="true" />
        <h2 id="no-tickets-heading" className="zg-section-heading">
          You haven't submitted any tickets yet.
        </h2>
        <CreateTicketLink className="zg-btn zg-btn-primary" />
      </section>
    )
  }

  const m = data.metrics
  const waiting = m.waitingForYou.value > 0
  return (
    <>
      {/* BR-39, BR-41, BR-42 in ui-spec.md §3 order. */}
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="visually-hidden">
          Metrics
        </h2>
        <ul className="zg-metric-grid">
          <li>
            <MetricCard
              label="Open Tickets"
              value={m.openTickets.value}
              to={m.openTickets.drillDown}
              emptyHelper="No open tickets."
            />
          </li>
          <li>
            {/* ui-spec.md §3: the one card asking the Requester to act gets
                a warning icon (non-color cue) and warning-colored value while above 0. */}
            <MetricCard
              label="Waiting for You"
              value={m.waitingForYou.value}
              to={m.waitingForYou.drillDown}
              emptyHelper="Nothing needs your reply."
              icon={waiting ? 'bi-exclamation-circle' : undefined}
              attention={waiting}
            />
          </li>
          <li>
            <MetricCard
              label="Resolved (Last 30 Days)"
              value={m.resolvedLast30Days.value}
              to={m.resolvedLast30Days.drillDown}
              emptyHelper="No tickets resolved in the last 30 days."
            />
          </li>
        </ul>
      </section>

      <div className="zg-dashboard-columns zg-dashboard-lists">
        {/* BR-43: newest first, any status, at most 5. */}
        <DashboardSection
          id="recently-updated"
          title="Recently Updated"
          emptyMessage={data.recentlyUpdated.length === 0 && 'No recent updates.'}
          footer={{ to: '/tickets?sortBy=updatedAt&sortDir=desc', label: 'View all my tickets' }}
        >
          <TicketList items={data.recentlyUpdated.map((t) => ({ ...t, at: t.updatedAt }))} />
        </DashboardSection>

        {/* BR-44: newest resolution first, at most 5. */}
        <DashboardSection
          id="recently-resolved"
          title="Recently Resolved"
          emptyMessage={data.recentlyResolved.length === 0 && 'No resolved tickets yet.'}
        >
          <TicketList items={data.recentlyResolved.map((t) => ({ ...t, at: t.resolvedAt }))} />
        </DashboardSection>
      </div>
    </>
  )
}

// ui-spec.md §3: Ticket Number (link), one-line Summary, Status badge, time.
function TicketList({ items }: { items: (RequesterDashboardTicketItem & { at: string })[] }) {
  return (
    <ul className="zg-dashboard-list">
      {items.map((t) => (
        <li key={t.id}>
          <Link to={`/tickets/${t.id}`} className="zg-dashboard-list-title">
            {t.ticketNumber}
          </Link>
          <p className="zg-dashboard-list-text zg-ellipsis">{t.summary}</p>
          <div className="zg-dashboard-list-meta">
            <StatusBadge status={t.currentStatus} />
            <span className="zg-helper">
              <time dateTime={t.at}>{formatDateTime(t.at)}</time>
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default RequesterDashboard
