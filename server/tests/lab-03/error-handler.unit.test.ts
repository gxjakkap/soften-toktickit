import { describe, expect, it, vi } from 'vitest'
import { errorEnvelope } from '../../src/lib/error-handler.js'

// PR #49 review: the generic error handler was flattening every error into
// 500 INTERNAL_ERROR, including body-parser 4xx errors (malformed/oversized
// JSON) and errors thrown after headers were already sent (e.g. mid-stream
// on res.sendFile). api-spec.md §0.3 requires 4xx to stay 4xx.

function mockRes(headersSent = false) {
  const res: {
    headersSent: boolean
    statusCode?: number
    body?: unknown
    status: (n: number) => typeof res
    json: (b: unknown) => typeof res
  } = {
    headersSent,
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

describe('errorEnvelope', () => {
  it('passes a body-parser 400 through as a safe 4xx, not 500', () => {
    const res = mockRes()
    const next = vi.fn()
    const err = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
    })

    errorEnvelope(err, {} as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({
      error: { code: 'MALFORMED_REQUEST', message: 'The request could not be read.' },
    })
  })

  it('passes a body-parser 413 through with its own status', () => {
    const res = mockRes()
    const next = vi.fn()
    const err = Object.assign(new Error('request entity too large'), { status: 413 })

    errorEnvelope(err, {} as never, res as never, next)

    expect(res.statusCode).toBe(413)
    expect(res.body).toEqual({
      error: { code: 'MALFORMED_REQUEST', message: 'The request could not be read.' },
    })
  })

  it('falls back to 500 INTERNAL_ERROR and logs for anything without a 4xx status', () => {
    const res = mockRes()
    const next = vi.fn()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    errorEnvelope(new Error('boom'), {} as never, res as never, next)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    })
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
  })

  it('does not log a passed-through 4xx as a server error', () => {
    const res = mockRes()
    const next = vi.fn()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    errorEnvelope(Object.assign(new Error('bad'), { status: 400 }), {} as never, res as never, next)

    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('delegates to next(err) instead of writing when headers are already sent', () => {
    const res = mockRes(true)
    const next = vi.fn()
    const err = new Error('mid-stream failure')

    errorEnvelope(err, {} as never, res as never, next)

    expect(next).toHaveBeenCalledWith(err)
    expect(res.statusCode).toBeUndefined()
  })
})
