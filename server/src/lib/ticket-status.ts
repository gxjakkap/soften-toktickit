import type { ActionStatus, TicketStatus } from '../generated/prisma/client.js'

// specification.md §7 (BR-22): the single source of truth for the Current
// Status transition matrix, so the status endpoint and its tests never
// drift from two copies of the same table.
export const TICKET_STATUSES: readonly string[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN', 'IN_PROGRESS'],
  CANCELLED: [],
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function permittedTransitions(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from]
}

// Lab 4 specification.md BR-15: the one definition of "active" used by
// Action writes (BR-10) and every dashboard metric and filter.
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'REOPENED',
]

export const isActiveTicketStatus = (status: TicketStatus): boolean =>
  ACTIVE_TICKET_STATUSES.includes(status)

// Lab 4 specification.md BR-18: the reasons are listed in this fixed order
// (api-spec.md §3.4), so the UI and tests can rely on it.
export type ResolutionBlockReason = 'NO_DONE_ACTION' | 'OPEN_ACTIONS' | 'PENDING_FOLLOW_UPS'

export type ResolutionGate = { canResolve: boolean; reasons: ResolutionBlockReason[] }

type GateAction = { status: ActionStatus; followUpRequired: boolean }

// Lab 4 specification.md BR-18 (FR-08): pure, so the status endpoint (inside
// its transaction, BR-19) and the staff Ticket Detail's advisory
// `resolutionGate` (api-spec.md §3.5) share one decision.
export function evaluateResolutionGate(actions: GateAction[]): ResolutionGate {
  const reasons: ResolutionBlockReason[] = []
  if (!actions.some((a) => a.status === 'DONE')) reasons.push('NO_DONE_ACTION')
  if (actions.some((a) => a.status === 'PLANNED' || a.status === 'IN_PROGRESS')) {
    reasons.push('OPEN_ACTIONS')
  }
  if (actions.some((a) => a.status !== 'CANCELLED' && a.followUpRequired)) {
    reasons.push('PENDING_FOLLOW_UPS')
  }
  return { canResolve: reasons.length === 0, reasons }
}

// Lab 4 specification.md BR-21: set on entering Resolved, kept on
// Resolved -> Closed, cleared on Reopened, untouched otherwise.
export function nextResolvedAt(to: TicketStatus, now: Date, current: Date | null): Date | null {
  if (to === 'RESOLVED') return now
  if (to === 'REOPENED') return null
  return current
}
