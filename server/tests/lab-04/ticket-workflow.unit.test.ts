import { describe, expect, it } from 'vitest'
import { nextResolvedAt } from '../../src/lib/ticket-status.js'

// UNIT-06: specification.md BR-21. resolvedAt is set on entering Resolved,
// kept on Resolved -> Closed, cleared on Reopened, and untouched otherwise.

const now = new Date('2026-10-06T04:05:00.000Z')
const earlier = new Date('2026-10-01T00:00:00.000Z')

describe('nextResolvedAt', () => {
  it('sets it to now on entering Resolved, even if one was set before', () => {
    expect(nextResolvedAt('RESOLVED', now, null)).toBe(now)
    expect(nextResolvedAt('RESOLVED', now, earlier)).toBe(now)
  })

  it('keeps it on Resolved -> Closed', () => {
    expect(nextResolvedAt('CLOSED', now, earlier)).toBe(earlier)
  })

  it('clears it on Reopened', () => {
    expect(nextResolvedAt('REOPENED', now, earlier)).toBeNull()
  })

  it('leaves it unchanged for every other target', () => {
    for (const to of ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'] as const) {
      expect(nextResolvedAt(to, now, null)).toBeNull()
    }
  })
})
