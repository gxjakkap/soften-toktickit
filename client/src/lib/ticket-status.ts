import type { ActionStatus, TicketStatus } from '../types'

// Client-side mirror of server/src/lib/ticket-status.ts (specification.md
// §7, BR-22). Used only to decide which options the Status select offers —
// the server remains the actual enforcement (FR-06).
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

export function permittedTransitions(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from]
}

// Lab 4 specification.md BR-15: mirror of server ACTIVE_TICKET_STATUSES.
// Actions can only be written on an active Ticket (BR-10).
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'REOPENED',
]

// Lab 4 specification.md BR-07: client mirror of the server's Action Status
// transitions, used only to decide which options the edit form offers.
export const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['PLANNED', 'DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
}

// Display labels shared by the badges and the Actions Taken section.
export const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
}

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}
