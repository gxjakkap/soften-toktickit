// API-53, API-54 (tests.md §2.2); AC-45, FR-22.
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { loginCookie } from '../helpers/auth.js'

// Lab 4 api-spec.md §1.1 (health with a database probe) and §0.2 (a 500 is
// always the generic envelope). The database failures are forced with spies
// on the shared Prisma client, so nothing in the real database changes.

const SECRET = 'connect ECONNREFUSED 10.0.0.7:5432 password=hunter2'
const GENERIC_500 = {
  error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
}

let staff: string
let jennifer: string
let ticketId: number

beforeAll(async () => {
  ;[staff, jennifer] = await Promise.all([
    loginCookie(app, 'sarah.johnson@example.com'),
    loginCookie(app, 'jennifer.anderson@example.com'),
  ])
  // Any active seeded Ticket: the create below never reaches the database.
  ticketId = (await prisma.ticket.findFirstOrThrow({ where: { currentStatus: 'IN_PROGRESS' } })).id
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe('API-53 health (AC-45, FR-22)', () => {
  it('200 with database ok when the database answers', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'TokTickIT API', database: 'ok' })
  })

  it('503 with a safe body when the database probe throws', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error(SECRET))
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({
      status: 'degraded',
      service: 'TokTickIT API',
      database: 'unreachable',
    })
    expect(res.text).not.toContain('ECONNREFUSED')
    expect(res.text).not.toContain('hunter2')
  })

  it('503 when the database probe hangs past the 2-second timeout', async () => {
    vi.spyOn(prisma, '$queryRaw').mockReturnValue(new Promise(() => {}) as never)
    const started = Date.now()
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body.database).toBe('unreachable')
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900)
  }, 10_000)
})

describe('API-54 safe 500 on the new endpoints (api-spec.md §0.2)', () => {
  it('Action create: a database error is the generic 500 with no driver text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma, '$transaction').mockRejectedValue(new Error(SECRET))
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', staff)
      .send({ actionAt: new Date().toISOString(), description: 'Never saved.' })
    expect(res.status).toBe(500)
    expect(res.body).toEqual(GENERIC_500)
  })

  it('staff dashboard: a database error is the generic 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma.ticket, 'count').mockRejectedValue(new Error(SECRET))
    const res = await request(app).get('/api/dashboard/staff').set('Cookie', staff)
    expect(res.status).toBe(500)
    expect(res.body).toEqual(GENERIC_500)
  })

  it('requester dashboard: a database error is the generic 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma.ticket, 'count').mockRejectedValue(new Error(SECRET))
    const res = await request(app).get('/api/dashboard/requester').set('Cookie', jennifer)
    expect(res.status).toBe(500)
    expect(res.body).toEqual(GENERIC_500)
  })
})
