import { describe, expect, it } from 'vitest'
import { hashPassword, isStrongPassword, verifyPassword } from '../../src/lib/password.js'

// Issue #3, no API-nn/UI-nn (unit level): api-spec.md §1.4 password rule and
// specification.md BR-09 (bcrypt, never plaintext), BR-10 (complexity), AC-29.

describe('hashPassword / verifyPassword (BR-09)', () => {
  it('stores a bcrypt hash, never the plaintext, and verifies the right password', async () => {
    const hash = await hashPassword('N3w!Passw0rd')
    expect(hash).toMatch(/^\$2[aby]\$10\$/)
    expect(hash).not.toContain('N3w!Passw0rd')
    expect(await verifyPassword('N3w!Passw0rd', hash)).toBe(true)
  })

  it('rejects a wrong password and salts each hash differently', async () => {
    const a = await hashPassword('N3w!Passw0rd')
    const b = await hashPassword('N3w!Passw0rd')
    expect(a).not.toBe(b)
    expect(await verifyPassword('n3w!passw0rd', a)).toBe(false)
  })
})

describe('isStrongPassword (BR-10)', () => {
  it('accepts 8+ chars with upper, lower, digit and special', () => {
    expect(isStrongPassword('N3w!Passw0rd')).toBe(true)
    expect(isStrongPassword('Ab1!efgh')).toBe(true)
  })

  it.each([
    ['too short', 'Ab1!efg'],
    ['no uppercase', 'n3w!passw0rd'],
    ['no lowercase', 'N3W!PASSW0RD'],
    ['no digit', 'New!Password'],
    ['no special character', 'N3wPassw0rd'],
    ['empty', ''],
  ])('rejects a password with %s', (_label, password) => {
    expect(isStrongPassword(password)).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(isStrongPassword(undefined)).toBe(false)
    expect(isStrongPassword(12345678)).toBe(false)
  })
})
