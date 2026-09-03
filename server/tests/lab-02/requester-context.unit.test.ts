import { describe, expect, it } from 'vitest'
import { parseRequesterId } from '../../src/lib/requester-context.js'

// UNIT-03 (BR-10, BR-12): pure parsing rules for the requester-context seam.
// The DB-backed "unknown or inactive" half of this rule is exercised against
// a real requester row by API-05 in create-ticket.api.test.ts.
describe('parseRequesterId', () => {
  it('rejects a missing id', () => {
    expect(parseRequesterId(undefined)).toBeNull()
    expect(parseRequesterId(null)).toBeNull()
  })

  it('rejects a non-numeric id', () => {
    expect(parseRequesterId('abc')).toBeNull()
    expect(parseRequesterId({})).toBeNull()
  })

  it('rejects zero and negative ids', () => {
    expect(parseRequesterId(0)).toBeNull()
    expect(parseRequesterId(-1)).toBeNull()
  })

  it('rejects a non-integer id', () => {
    expect(parseRequesterId(1.5)).toBeNull()
  })

  it('accepts a positive integer, from a number or a numeric string', () => {
    expect(parseRequesterId(1)).toBe(1)
    expect(parseRequesterId('42')).toBe(42)
  })
})
