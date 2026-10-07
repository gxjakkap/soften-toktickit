import { describe, expect, it } from 'vitest'
import { permittedTransitions as clientPermitted } from '../../src/lib/ticket-status'
import {
  TICKET_STATUSES,
  permittedTransitions as serverPermitted,
} from '../../../server/src/lib/ticket-status'
import type { TicketStatus } from '../../src/types'

// UNIT-08 (BR-16, AC-21): docs/lab-04 ui-spec.md §5.1 keeps the Status
// select's options in a client mirror of the server matrix. This fails if
// the two copies ever drift.

describe('client and server transition matrices', () => {
  it.each(TICKET_STATUSES as TicketStatus[])('agree on the permitted set from %s', (from) => {
    expect([...clientPermitted(from)].sort()).toEqual([...serverPermitted(from)].sort())
  })
})
