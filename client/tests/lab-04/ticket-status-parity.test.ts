import { describe, expect, it } from 'vitest'
import {
  ACTION_TRANSITIONS,
  ACTIVE_TICKET_STATUSES as clientActive,
  permittedTransitions as clientPermitted,
} from '../../src/lib/ticket-status'
import {
  ACTIVE_TICKET_STATUSES as serverActive,
  TICKET_STATUSES,
  permittedTransitions as serverPermitted,
} from '../../../server/src/lib/ticket-status'
import { ACTION_STATUSES, canTransitionAction } from '../../../server/src/lib/action-rules'
import type { ActionStatus, TicketStatus } from '../../src/types'

// UNIT-08 (BR-16, AC-21): docs/lab-04 ui-spec.md §5.1 keeps the Status
// select's options in a client mirror of the server matrix. This fails if
// the two copies ever drift.

describe('client and server transition matrices', () => {
  it.each(TICKET_STATUSES as TicketStatus[])('agree on the permitted set from %s', (from) => {
    expect([...clientPermitted(from)].sort()).toEqual([...serverPermitted(from)].sort())
  })
})

// BR-15: the Actions Taken UI hides its write controls outside this set.
it('client and server agree on the active statuses', () => {
  expect([...clientActive].sort()).toEqual([...serverActive].sort())
})

// BR-07: the Actions Taken edit form offers only these next statuses.
it('client and server agree on the Action Status transitions', () => {
  for (const from of ACTION_STATUSES as ActionStatus[]) {
    for (const to of ACTION_STATUSES as ActionStatus[]) {
      expect(ACTION_TRANSITIONS[from].includes(to)).toBe(canTransitionAction(from, to))
    }
  }
})
