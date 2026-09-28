import { describe, expect, it, vi } from 'vitest'
import {
  isOwner,
  requirePasswordChangeSatisfied,
  requireRole,
} from '../../src/lib/authorization.js'

// Issue #4, specification.md §5 (FR-06, FR-24, BR-03) and api-spec.md §0.1, §1.5.
// Guard/ownership-check functions tested in isolation, no DB or HTTP involved.

function mockRes() {
  const res: {
    statusCode?: number
    body?: unknown
    status: (n: number) => typeof res
    json: (b: unknown) => typeof res
  } = {
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

describe('requirePasswordChangeSatisfied (api-spec.md §1.5)', () => {
  it('403 PASSWORD_CHANGE_REQUIRED when the caller must still change their password', () => {
    const req = { user: { mustChangePassword: true } } as never
    const res = mockRes()
    const next = vi.fn()

    requirePasswordChangeSatisfied(req, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({
      error: {
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before continuing.',
      },
    })
  })

  it('calls next when the gate is already satisfied', () => {
    const req = { user: { mustChangePassword: false } } as never
    const res = mockRes()
    const next = vi.fn()

    requirePasswordChangeSatisfied(req, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBeUndefined()
  })
})

describe('requireRole (api-spec.md §0.1 role rule)', () => {
  it('403 FORBIDDEN when the caller role is not in the permitted list', () => {
    const req = { user: { role: 'REQUESTER' } } as never
    const res = mockRes()
    const next = vi.fn()

    requireRole('IT_STAFF', 'ADMINISTRATOR')(req, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      },
    })
  })

  it('calls next when the caller role is permitted', () => {
    const req = { user: { role: 'IT_STAFF' } } as never
    const res = mockRes()
    const next = vi.fn()

    requireRole('IT_STAFF', 'ADMINISTRATOR')(req, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBeUndefined()
  })

  // PR #49 review: cheap insurance for a route mounted without `requireAuth`
  // running first — a misconfiguration should surface as 401, not a bare
  // TypeError that the error envelope can only report as a 500.
  it('401 UNAUTHENTICATED instead of throwing when req.user is not set', () => {
    const req = {} as never
    const res = mockRes()
    const next = vi.fn()

    requireRole('IT_STAFF')(req, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to continue.' },
    })
  })
})

describe('isOwner (BR-03)', () => {
  it('true only when the resource owner id equals the authenticated user id', () => {
    expect(isOwner(1, 1)).toBe(true)
  })

  it('false for a different owner', () => {
    expect(isOwner(1, 2)).toBe(false)
  })

  it('false when the resource has no owner (null/undefined)', () => {
    expect(isOwner(1, null)).toBe(false)
    expect(isOwner(1, undefined)).toBe(false)
  })
})
