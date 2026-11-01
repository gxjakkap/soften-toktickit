// UNIT-07 — AC-37: docs/lab-04 ui-spec.md §2.1 (BR-33). Every date the UI
// shows is Asia/Bangkok, whatever the browser's own zone, with three-letter
// months ("Sep", not ICU's en-GB "Sept").
process.env.TZ = 'America/New_York'

import { describe, expect, it } from 'vitest'
import { formatBangkokDate, formatDate, formatDateTime } from '../../src/lib/datetime'

describe('UNIT-07: Bangkok date formatter', () => {
  it('renders an instant as Bangkok date and time under a non-Bangkok zone', () => {
    expect(formatDateTime('2026-10-06T07:05:00Z')).toBe('6 Oct 2026, 14:05')
  })

  it('rolls the date at Bangkok midnight, not the browser midnight', () => {
    expect(formatDate('2026-10-06T16:59:59Z')).toBe('6 Oct 2026')
    expect(formatDate('2026-10-06T17:00:00Z')).toBe('7 Oct 2026')
  })

  it('abbreviates September as "Sep" in every format', () => {
    expect(formatDateTime('2026-09-05T02:00:00Z')).toBe('5 Sep 2026, 09:00')
    expect(formatDate('2026-09-05T02:00:00Z')).toBe('5 Sep 2026')
    expect(formatBangkokDate('2026-09-07')).toBe('7 Sep 2026')
  })
})
