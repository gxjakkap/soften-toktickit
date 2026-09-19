import type { RequestedPriority, TicketStatus } from './types'

// ui-spec.md §9: Pending/In Progress and Cancelled/Closed share a badge
// colour, so each pair also carries a distinct icon (never colour alone).
// Single source of truth so My Tickets and Ticket Detail can't drift apart.
const STATUS_ICON: Partial<Record<TicketStatus, string>> = {
  WAITING_FOR_REQUESTER: 'bi-hourglass-split',
  IN_PROGRESS: 'bi-arrow-repeat',
  CANCELLED: 'bi-x-circle',
  CLOSED: 'bi-check2-circle',
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
}

const STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  NEW: 'zg-badge-status-new',
  OPEN: 'zg-badge-status-open',
  IN_PROGRESS: 'zg-badge-status-in-progress',
  WAITING_FOR_REQUESTER: 'zg-badge-status-pending',
  RESOLVED: 'zg-badge-status-resolved',
  CLOSED: 'zg-badge-status-closed',
  REOPENED: 'zg-badge-status-open',
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
