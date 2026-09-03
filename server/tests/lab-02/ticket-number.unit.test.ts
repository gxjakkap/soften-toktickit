import { describe, expect, it } from 'vitest'
import { formatTicketNumber } from '../../src/lib/ticket-number.js'

// UNIT-01 (BR-06, AC-01): TKT-<4-digit year>-<6-digit zero-padded id>.
describe('formatTicketNumber', () => {
  it('zero-pads the id to 6 digits', () => {
    expect(formatTicketNumber(42, 2026)).toBe('TKT-2026-000042')
  })

  it('does not truncate an id wider than 6 digits', () => {
    expect(formatTicketNumber(1234567, 2026)).toBe('TKT-2026-1234567')
  })

  it('uses the given year verbatim', () => {
    expect(formatTicketNumber(1, 2030)).toBe('TKT-2030-000001')
  })
})
