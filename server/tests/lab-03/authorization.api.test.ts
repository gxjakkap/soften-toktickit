import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'

// Issue #4, specification.md §5 (FR-06, FR-24, BR-03, BR-40) and api-spec.md
// §0.1, §1.5, §4, §5: role/ownership guards wired onto the current-user route
// and the Ticket Queue/Detail/Admin stub routes.
//
// Fixtures live under TAG and are removed in afterAll (sessions cascade with users).
const TAG = 'lab3.authz.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`

const fixtures = [
  { name: 'Authz Requester', email: email('requester'), role: 'REQUESTER' as const },
  { name: 'Authz Staff', email: email('staff'), role: 'IT_STAFF' as const },
  { name: 'Authz Admin', email: email('admin'), role: 'ADMINISTRATOR' as const },
  {
    name: 'Authz Gated Requester',
    email: email('gated'),
    role: 'REQUESTER' as const,
    mustChangePassword: true,
  },
]

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  await prisma.user.createMany({
    data: fixtures.map((f) => ({ ...f, passwordHash, isActive: true })),
  })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
})

async function loginCookie(e: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email: e, password: PASSWORD })
  const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
    c.startsWith('tik_session='),
  )!
  return raw.split(';')[0]!
}

describe('GET /api/auth/me (refactored onto authenticate)', () => {
  it('still 401s with no session and 200s with one (regression check)', async () => {
    const none = await request(app).get('/api/auth/me')
    expect(none.status).toBe(401)
    expect(none.body.error.code).toBe('UNAUTHENTICATED')

    const cookie = await loginCookie(email('requester'))
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe(email('requester'))
  })
})

describe('Ticket Queue / Detail role guards (api-spec.md §4)', () => {
  it('401 UNAUTHENTICATED on the queue with no session', async () => {
    const res = await request(app).get('/api/staff/tickets')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('403 FORBIDDEN when a Requester calls the Queue (AC-35)', async () => {
    const cookie = await loginCookie(email('requester'))
    const res = await request(app).get('/api/staff/tickets').set('Cookie', cookie)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('allows an IT Staff caller through the guard chain (Issue #6: the Queue itself)', async () => {
    const cookie = await loginCookie(email('staff'))
    const res = await request(app).get('/api/staff/tickets').set('Cookie', cookie)
    expect(res.status).toBe(200)
  })

  it('403 FORBIDDEN when an Administrator calls the Queue (BR-40/AC-37)', async () => {
    const cookie = await loginCookie(email('admin'))
    const res = await request(app).get('/api/staff/tickets').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('Administrator is allowed on Ticket Detail read-only (BR-40/AC-36), Requester is not (AC-04)', async () => {
    const adminCookie = await loginCookie(email('admin'))
    // Issue #7: the route now runs real lookup logic, so a nonexistent id
    // 404s — proof the guard chain let the Administrator through to it,
    // rather than stopping at the role check (which would be 403).
    const adminRes = await request(app)
      .get('/api/staff/tickets/999999999')
      .set('Cookie', adminCookie)
    expect(adminRes.status).toBe(404)

    const requesterCookie = await loginCookie(email('requester'))
    const requesterRes = await request(app)
      .get('/api/staff/tickets/1')
      .set('Cookie', requesterCookie)
    expect(requesterRes.status).toBe(403)
    expect(requesterRes.body.error.code).toBe('FORBIDDEN')
    expect(JSON.stringify(requesterRes.body)).not.toMatch(/internal|content/i)
  })

  it('Administrator is rejected from every Queue mutation route (BR-40/AC-37)', async () => {
    const cookie = await loginCookie(email('admin'))
    for (const call of [
      () => request(app).patch('/api/staff/tickets/1/claim').set('Cookie', cookie),
      () => request(app).patch('/api/staff/tickets/1/owner').set('Cookie', cookie),
      () => request(app).patch('/api/staff/tickets/1/priority').set('Cookie', cookie),
      () => request(app).patch('/api/staff/tickets/1/status').set('Cookie', cookie),
      () => request(app).post('/api/staff/tickets/1/comments').set('Cookie', cookie),
    ]) {
      const res = await call()
      expect(res.status).toBe(403)
    }
  })

  it('an IT Staff mutation route passes the guard chain through to the real route (Issue #7)', async () => {
    const cookie = await loginCookie(email('staff'))
    const res = await request(app).patch('/api/staff/tickets/999999999/claim').set('Cookie', cookie)
    expect(res.status).toBe(404)
  })
})

describe('Admin User Management role guards (api-spec.md §5)', () => {
  it('401 UNAUTHENTICATED with no session', async () => {
    const res = await request(app).get('/api/admin/users')
    expect(res.status).toBe(401)
  })

  it('403 FORBIDDEN when IT Staff calls an Admin endpoint (AC-11)', async () => {
    const cookie = await loginCookie(email('staff'))
    const res = await request(app).get('/api/admin/users').set('Cookie', cookie)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('403 FORBIDDEN when a Requester calls an Admin endpoint', async () => {
    const cookie = await loginCookie(email('requester'))
    const res = await request(app).post('/api/admin/users').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('passes an Administrator caller through to the stub', async () => {
    const cookie = await loginCookie(email('admin'))
    const res = await request(app).get('/api/admin/users').set('Cookie', cookie)
    expect(res.status).toBe(501)
  })
})

describe('Mandatory password-change gate (api-spec.md §1.5)', () => {
  it('403 PASSWORD_CHANGE_REQUIRED on a protected non-auth route, even for the right role', async () => {
    const cookie = await loginCookie(email('gated'))
    const res = await request(app).get('/api/staff/tickets').set('Cookie', cookie)
    // Gated fixture is a REQUESTER, so use an endpoint any authenticated
    // caller reaches the gate on before the role check would 403 instead.
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED')
  })

  it('does not gate /api/auth/me itself', async () => {
    const cookie = await loginCookie(email('gated'))
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.mustChangePassword).toBe(true)
  })
})
