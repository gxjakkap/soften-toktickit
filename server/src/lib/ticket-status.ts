import type { TicketStatus } from '../generated/prisma/client.js'

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
