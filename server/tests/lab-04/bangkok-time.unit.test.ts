// UNIT-05 (tests.md §2.1); AC-29.
import { describe, expect, it } from 'vitest'
import {
  addDays,
  bangkokDateString,
  parseBangkokDate,
  startOfBangkokDay,
} from '../../src/lib/bangkok-time.js'

// Lab 4 api-spec.md §5.3 and specification.md BR-34: a dashboard day is the
// Asia/Bangkok calendar day, [17:00 UTC of the previous day, 17:00 UTC).

describe('bangkokDateString', () => {
  it('puts 16:59:59.999Z and 17:00:00.000Z on different Bangkok days (AC-29)', () => {
    expect(bangkokDateString(new Date('2026-10-06T16:59:59.999Z'))).toBe('2026-10-06')
    expect(bangkokDateString(new Date('2026-10-06T17:00:00.000Z'))).toBe('2026-10-07')
  })

  it('crosses month and year boundaries', () => {
    expect(bangkokDateString(new Date('2026-12-31T17:00:00.000Z'))).toBe('2027-01-01')
    expect(bangkokDateString(new Date('2026-02-28T18:00:00.000Z'))).toBe('2026-03-01')
  })
})

describe('startOfBangkokDay', () => {
  it('returns 17:00Z of the previous UTC day', () => {
    expect(startOfBangkokDay(new Date('2026-10-07T05:00:00.000Z')).toISOString()).toBe(
      '2026-10-06T17:00:00.000Z',
    )
    expect(startOfBangkokDay(new Date('2026-10-06T17:00:00.000Z')).toISOString()).toBe(
      '2026-10-06T17:00:00.000Z',
    )
    expect(startOfBangkokDay(new Date('2026-10-06T16:59:59.999Z')).toISOString()).toBe(
      '2026-10-05T17:00:00.000Z',
    )
  })

  it('gives the BR-42 30-day window start (today and the 29 days before it)', () => {
    const now = new Date('2026-10-06T07:05:00.000Z') // 14:05 Bangkok, 6 Oct
    const windowStart = addDays(startOfBangkokDay(now), -29)
    expect(windowStart.toISOString()).toBe('2026-09-06T17:00:00.000Z')
    expect(bangkokDateString(windowStart)).toBe('2026-09-07')
  })
})

describe('parseBangkokDate', () => {
  it('maps YYYY-MM-DD to 00:00 +07:00 of that date', () => {
    expect(parseBangkokDate('2026-10-07')?.toISOString()).toBe('2026-10-06T17:00:00.000Z')
  })

  it('rejects anything that is not a real calendar date', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '06/10/2026', '', 'today']) {
      expect(parseBangkokDate(bad)).toBeNull()
    }
    expect(parseBangkokDate(['2026-10-07'])).toBeNull()
    expect(parseBangkokDate(undefined)).toBeNull()
  })
})
