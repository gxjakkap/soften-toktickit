import { ACTION_STATUS_LABEL, STATUS_LABEL } from './lib/ticket-status'
import type { ActionStatus, RequestedPriority, TicketStatus, UserRole } from './types'

// ui-spec.md §9: Pending/In Progress and Cancelled/Closed share a badge
// colour, so each pair also carries a distinct icon (never colour alone).
// Single source of truth so My Tickets and Ticket Detail can't drift apart.
const STATUS_ICON: Partial<Record<TicketStatus, string>> = {
  WAITING_FOR_REQUESTER: 'bi-hourglass-split',
  IN_PROGRESS: 'bi-arrow-repeat',
  CANCELLED: 'bi-x-circle',
  CLOSED: 'bi-check2-circle',
}

const STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  NEW: 'zg-badge-status-new',
  OPEN: 'zg-badge-status-open',
  IN_PROGRESS: 'zg-badge-status-in-progress',
  WAITING_FOR_REQUESTER: 'zg-badge-status-pending',
  RESOLVED: 'zg-badge-status-resolved',
  CLOSED: 'zg-badge-status-closed',
  REOPENED: 'zg-badge-status-reopened',
  CANCELLED: 'zg-badge-status-cancelled',
}

const PRIORITY_LABEL: Record<RequestedPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

const PRIORITY_BADGE_CLASS: Record<RequestedPriority, string> = {
  LOW: 'zg-badge-priority-low',
  MEDIUM: 'zg-badge-priority-medium',
  HIGH: 'zg-badge-priority-high',
}

export function StatusBadge({ status, testId }: { status: TicketStatus; testId?: string }) {
  const icon = STATUS_ICON[status]
  return (
    <span className={`zg-badge ${STATUS_BADGE_CLASS[status]}`} data-testid={testId}>
      {icon && <i className={`bi ${icon}`} aria-hidden="true" />}
      {STATUS_LABEL[status]}
    </span>
  )
}

export function PriorityBadge({
  priority,
  testId,
}: {
  priority: RequestedPriority
  testId?: string
}) {
  return (
    <span className={`zg-badge ${PRIORITY_BADGE_CLASS[priority]}`} data-testid={testId}>
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

// ui-spec.md §8: role badges for Public Comment authors (and, later, any
// other screen that shows who a user is).
const ROLE_LABEL: Record<UserRole, string> = {
  REQUESTER: 'Requester',
  IT_STAFF: 'IT Staff',
  ADMINISTRATOR: 'Administrator',
}

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  REQUESTER: 'zg-badge-role-requester',
  IT_STAFF: 'zg-badge-role-it-staff',
  ADMINISTRATOR: 'zg-badge-role-administrator',
}

export function RoleBadge({ role, testId }: { role: UserRole; testId?: string }) {
  return (
    <span className={`zg-badge ${ROLE_BADGE_CLASS[role]}`} data-testid={testId}>
      {ROLE_LABEL[role]}
    </span>
  )
}

// ui-spec.md §8 (Lab 3): the user Active/Inactive badge, shared by User
// Management and the Actions Taken assignee (Lab 4 ui-spec.md §8).
export function UserStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`zg-badge ${active ? 'zg-badge-status-resolved' : 'zg-badge-status-closed'}`}>
      <i className={`bi ${active ? 'bi-check-circle' : 'bi-slash-circle'}`} aria-hidden="true" />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// Lab 4 ui-spec.md §8: every Action Status badge has text and an icon.
const ACTION_STATUS_STYLE: Record<ActionStatus, { className: string; icon: string }> = {
  PLANNED: { className: 'zg-badge-action-planned', icon: 'bi-circle' },
  IN_PROGRESS: { className: 'zg-badge-status-in-progress', icon: 'bi-circle-half' },
  DONE: { className: 'zg-badge-action-done', icon: 'bi-check-circle' },
  CANCELLED: { className: 'zg-badge-status-cancelled', icon: 'bi-slash-circle' },
}

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  const { className, icon } = ACTION_STATUS_STYLE[status]
  return (
    <span className={`zg-badge ${className}`}>
      <i className={`bi ${icon}`} aria-hidden="true" />
      {ACTION_STATUS_LABEL[status]}
    </span>
  )
}

export function FollowUpBadge() {
  return (
    <span className="zg-badge zg-badge-follow-up">
      <i className="bi bi-flag" aria-hidden="true" />
      Follow-up
    </span>
  )
}
