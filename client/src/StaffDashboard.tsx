import { Link } from 'react-router-dom'
import { fetchStaffDashboard } from './apiClient'
import { ActionStatusBadge, PriorityBadge, RoleBadge, StatusBadge } from './badges'
import {
  DashboardError,
  DashboardHeader,
  DashboardSection,
  DashboardSkeleton,
} from './DashboardParts'
import { Forbidden } from './FeedbackState'
import { formatDateTime } from './lib/datetime'
import { roleHomePath } from './lib/role-routes'
import { STATUS_LABEL } from './lib/ticket-status'
import MetricCard from './MetricCard'
import { useAuth } from './useAuth'
import { useDashboard } from './useDashboard'
import type { RequestedPriority, StaffDashboard as StaffDashboardData, UserRole } from './types'

const PRIORITY_LABEL: Record<RequestedPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

const ROLE_ORDER: { role: UserRole; label: string }[] = [
  { role: 'REQUESTER', label: 'Requester' },
  { role: 'IT_STAFF', label: 'IT Staff' },
  { role: 'ADMINISTRATOR', label: 'Administrator' },
]

const Time = ({ iso }: { iso: string }) => <time dateTime={iso}>{formatDateTime(iso)}</time>

// Lab 4 ui-spec.md §4 (FR-13, FR-14, FR-15, AC-28..AC-34): the IT Staff and
// Administrator dashboard. Every value and drill-down comes from
// GET /api/dashboard/staff (BR-35); the screen computes nothing itself.
function StaffDashboard() {
  const { user } = useAuth()
  const { data, loading, failed, forbidden, refresh } = useDashboard(fetchStaffDashboard)

  // ui-spec.md §4: the API 403 is the authority; show the Lab 3 full-page state.
  if (forbidden) {
    return (
      <Forbidden testId="dashboard-forbidden" homeTo={user ? roleHomePath(user.role) : '/login'} />
    )
  }

  return (
    <div>
      <DashboardHeader
        subtitle={`Welcome back, ${user?.name}. Operational overview.`}
        generatedAt={data?.generatedAt}
        refreshing={loading}
        onRefresh={refresh}
      />
      {failed && <DashboardError onRetry={refresh} stale={data !== null} />}
      {data ? (
        <StaffDashboardBody data={data} />
      ) : (
        loading && <DashboardSkeleton cards={6} lists={2} />
      )}
    </div>
  )
}

function StaffDashboardBody({ data }: { data: StaffDashboardData }) {
  const m = data.metrics
  return (
    <>
      {/* BR-45..BR-50 in ui-spec.md §4 order: "my work" first, then team attention. */}
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="visually-hidden">
          Metrics
        </h2>
        <ul className="zg-metric-grid">
          <li>
            <MetricCard
              label="My Open Actions"
              value={m.myOpenActions.value}
              to={m.myOpenActions.drillDown}
              secondary={`across ${m.myOpenActions.ticketCount} ${m.myOpenActions.ticketCount === 1 ? 'ticket' : 'tickets'}`}
              emptyHelper="No open actions assigned to you."
            />
          </li>
          <li>
            <MetricCard
              label="My Active Tickets"
              value={m.myActiveTickets.value}
              to={m.myActiveTickets.drillDown}
              emptyHelper="You don't own any active tickets."
            />
          </li>
          <li>
            <MetricCard
              label="Follow-Ups Pending"
              value={m.followUpsPending.value}
              to={m.followUpsPending.drillDown}
              emptyHelper="No pending follow-ups."
            />
          </li>
          <li>
            <MetricCard
              label="Unassigned"
              value={m.unassigned.value}
              to={m.unassigned.drillDown}
              emptyHelper="Every active ticket has an owner."
            />
          </li>
          <li>
            <MetricCard
              label="High Priority"
              value={m.highPriority.value}
              to={m.highPriority.drillDown}
              icon="bi-exclamation-triangle"
              emptyHelper="No active high-priority tickets."
            />
          </li>
          <li>
            <MetricCard
              label="Resolved Today"
              value={m.resolvedToday.value}
              to={m.resolvedToday.drillDown}
              emptyHelper="Nothing resolved yet today."
            />
          </li>
        </ul>
      </section>

      {/* BR-51/BR-52: every entry shown, zeros included, each a drill-down link. */}
      <div className="zg-dashboard-columns">
        <DashboardSection id="by-status" title="Tickets by Status">
          <ul className="zg-breakdown">
            {data.byStatus.map((s) => (
              <li key={s.status}>
                <Link
                  to={s.drillDown}
                  aria-label={`${STATUS_LABEL[s.status]}: ${s.value}. View tickets`}
                >
                  <StatusBadge status={s.status} />
                  <span className="zg-breakdown-value">{s.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>
        <DashboardSection id="by-priority" title="Active Tickets by IT Priority">
          <ul className="zg-breakdown">
            {data.activeByItPriority.map((p) => (
              <li key={p.itPriority}>
                <Link
                  to={p.drillDown}
                  aria-label={`${PRIORITY_LABEL[p.itPriority]} IT Priority: ${p.value}. View tickets`}
                >
                  <PriorityBadge priority={p.itPriority} />
                  <span className="zg-breakdown-value">{p.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>
      </div>

      <div className="zg-dashboard-columns zg-dashboard-lists">
        {/* BR-53: each row opens Ticket Detail at its Actions Taken section. */}
        <DashboardSection
          id="my-open-actions"
          title="My Open Actions"
          emptyMessage={data.myOpenActionList.length === 0 && 'No open actions assigned to you.'}
          footer={{
            to: m.myOpenActions.drillDown,
            label: 'View all',
            ariaLabel: 'View all tickets with my open actions',
          }}
        >
          <ul className="zg-dashboard-list">
            {data.myOpenActionList.map((a) => (
              <li key={a.actionId}>
                <Link to={a.drillDown} className="zg-dashboard-list-title">
                  {a.ticketNumber}
                </Link>
                <p className="zg-dashboard-list-text">{a.description}</p>
                <div className="zg-dashboard-list-meta">
                  <ActionStatusBadge status={a.status} />
                  <span className="zg-helper">
                    <Time iso={a.actionAt} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </DashboardSection>

        {/* BR-54: newest first, any status. */}
        <DashboardSection
          id="recently-updated"
          title="Recently Updated"
          emptyMessage={data.recentlyUpdated.length === 0 && 'No tickets yet.'}
          footer={{
            to: '/staff/tickets?sortBy=updatedAt&sortDir=desc',
            label: 'View all in Ticket Queue',
          }}
        >
          <ul className="zg-dashboard-list">
            {data.recentlyUpdated.map((t) => (
              <li key={t.id}>
                <Link to={`/staff/tickets/${t.id}`} className="zg-dashboard-list-title">
                  {t.ticketNumber}
                </Link>
                <p className="zg-dashboard-list-text zg-ellipsis">{t.summary}</p>
                <div className="zg-dashboard-list-meta">
                  <StatusBadge status={t.currentStatus} />
                  <span className="zg-helper">
                    {t.ownerName ?? <span className="zg-text-muted">Unassigned</span>}
                    {' · '}
                    <Time iso={t.updatedAt} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </DashboardSection>
      </div>

      {/* BR-55: Administrator only; the key is absent for IT Staff. */}
      {data.userAccounts && (
        <DashboardSection id="user-accounts" title="User Accounts">
          <table className="zg-table zg-user-accounts">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Active</th>
                <th scope="col">Inactive</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ORDER.map(({ role, label }) => {
                const c = data.userAccounts![role]
                return (
                  <tr key={role}>
                    <th scope="row">
                      <Link
                        to={c.drillDown}
                        aria-label={`${label}: ${c.active} active, ${c.inactive} inactive. View users`}
                      >
                        <RoleBadge role={role} />
                      </Link>
                    </th>
                    <td data-label="Active">{c.active}</td>
                    <td data-label="Inactive">{c.inactive}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DashboardSection>
      )}
    </>
  )
}

export default StaffDashboard
