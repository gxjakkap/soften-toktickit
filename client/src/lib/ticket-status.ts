import type { TicketStatus } from '../types'

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
