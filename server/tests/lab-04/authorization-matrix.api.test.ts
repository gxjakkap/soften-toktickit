// SEC-01..SEC-04 (tests.md §2.3); AC-06, AC-22, AC-32.
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Lab 4 api-spec.md §6 (FR-11, BR-12, BR-17, BR-29, BR-31): one table-driven
// pass over every endpoint Lab 4 adds, run as unauthenticated, Requester, IT
// Staff, and Administrator. The Lab 1-3 endpoints, including the staff
// routes whose Administrator rows BR-29 flipped to allowed, stay in
// server/tests/lab-03/authorization-matrix.api.test.ts.

const TAG = 'lab4.authz-matrix.test.invalid'
const email = (name: string) => `${name}@${TAG}`
const NOTE = `Lab 4 matrix internal note ${TAG}`

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'
const ALL_ROLES: Role[] = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']
const STAFF: Role[] = ['IT_STAFF', 'ADMINISTRATOR']
const cookies = {} as Record<Role | 'OTHER', string>

let ticketId: number
let otherTicketId: number
let actionId: number

beforeAll(async () => {
  const passwordHash = await hashPassword('DevPass123!')
  const make = (name: string, role: Role) =>
    prisma.user.create({ data: { name: `Matrix ${name}`, email: email(name), role, passwordHash } })
  const [requester, staff, admin, other] = await Promise.all([
    make('requester', 'REQUESTER'),
    make('staff', 'IT_STAFF'),
    make('admin', 'ADMINISTRATOR'),
    make('other', 'REQUESTER'),
  ])
  cookies.REQUESTER = await loginCookie(app, requester.email)
  cookies.IT_STAFF = await loginCookie(app, staff.email)
  cookies.ADMINISTRATOR = await loginCookie(app, admin.email)
  cookies.OTHER = await loginCookie(app, other.email)

  const category = await prisma.category.create({ data: { name: `Category ${TAG}` } })
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  const body = {
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    requestedPriority: 'MEDIUM',
    summary: 'Lab 4 authorization matrix fixture',
    description: 'Ticket created to exercise the Lab 4 role-authorization matrix.',
  }
  ticketId = (await request(app).post('/api/tickets').set('Cookie', cookies.REQUESTER).send(body))
    .body.id
  otherTicketId = (await request(app).post('/api/tickets').set('Cookie', cookies.OTHER).send(body))
    .body.id
  const action = await request(app)
    .post(`/api/staff/tickets/${ticketId}/actions`)
    .set('Cookie', cookies.IT_STAFF)
    .send({ actionAt: new Date().toISOString(), description: 'Matrix fixture action.' })
  expect(action.status).toBe(201)
  actionId = action.body.id
  const note = await request(app)
    .post(`/api/staff/tickets/${ticketId}/comments`)
    .set('Cookie', cookies.IT_STAFF)
    .send({ visibility: 'INTERNAL', content: NOTE })
  expect(note.status).toBe(201)
})

afterAll(async () => {
  const mine = { ticket: { requester: { email: { endsWith: TAG } } } }
  await prisma.actionTaken.deleteMany({ where: mine })
  await prisma.ticketComment.deleteMany({ where: mine })
  await prisma.ticketStatusHistory.deleteMany({ where: mine })
  await prisma.ticket.deleteMany({ where: mine.ticket })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
})

interface Case {
  label: string
  method: 'get' | 'post' | 'patch'
  path: () => string
  allowed: Role[]
}

const CASES: Case[] = [
  {
    label: 'GET /api/staff/tickets/:id/actions',
    method: 'get',
    path: () => `/api/staff/tickets/${ticketId}/actions`,
    allowed: STAFF,
  },
  {
    label: 'POST /api/staff/tickets/:id/actions',
    method: 'post',
    path: () => `/api/staff/tickets/${ticketId}/actions`,
    allowed: STAFF,
  },
  {
    label: 'PATCH /api/staff/tickets/:id/actions/:actionId',
    method: 'patch',
    path: () => `/api/staff/tickets/${ticketId}/actions/${actionId}`,
    allowed: STAFF,
  },
  {
    label: 'GET /api/staff/tickets/:id/status-history',
    method: 'get',
    path: () => `/api/staff/tickets/${ticketId}/status-history`,
    allowed: STAFF,
  },
  {
    label: 'GET /api/tickets/:id/actions',
    method: 'get',
    path: () => `/api/tickets/${ticketId}/actions`,
    allowed: ['REQUESTER'],
  },
  {
    label: 'GET /api/tickets/:id/status-history',
    method: 'get',
    path: () => `/api/tickets/${ticketId}/status-history`,
    allowed: ['REQUESTER'],
  },
  {
    label: 'GET /api/dashboard/requester',
    method: 'get',
    path: () => '/api/dashboard/requester',
    allowed: ['REQUESTER'],
  },
  {
    label: 'GET /api/dashboard/staff',
    method: 'get',
    path: () => '/api/dashboard/staff',
    allowed: STAFF,
  },
]

describe('SEC-01: every Lab 4 endpoint x every role (api-spec.md §6)', () => {
  for (const c of CASES) {
    it(`401 UNAUTHENTICATED: ${c.label} with no session`, async () => {
      const res = await (request(app) as any)[c.method](c.path()).send({})
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    for (const role of ALL_ROLES.filter((r) => !c.allowed.includes(r))) {
      it(`403 FORBIDDEN: ${c.label} as ${role}`, async () => {
        const res = await (request(app) as any)
          [c.method](c.path())
          .set('Cookie', cookies[role])
          .send({})
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
      })
    }

    // An over-restrictive guard fails here the way an over-permissive one
    // fails above. An empty body is a 400 from the handler, which is enough.
    for (const role of c.allowed) {
      it(`reaches the handler (not 401/403): ${c.label} as ${role}`, async () => {
        const res = await (request(app) as any)
          [c.method](c.path())
          .set('Cookie', cookies[role])
          .send({})
        expect(res.status).not.toBe(401)
        expect(res.status).not.toBe(403)
      })
    }
  }

  it('the dashboards answer an allowed role with 200', async () => {
    for (const [path, role] of [
      ['/api/dashboard/requester', 'REQUESTER'],
      ['/api/dashboard/staff', 'IT_STAFF'],
      ['/api/dashboard/staff', 'ADMINISTRATOR'],
    ] as const) {
      expect((await request(app).get(path).set('Cookie', cookies[role])).status).toBe(200)
    }
  })
})

describe('SEC-02: no existence leak on another Requester’s Ticket (BR-12, BR-31)', () => {
  it.each(['actions', 'status-history'])(
    'GET /api/tickets/:id/%s is the same 404 as a missing Ticket',
    async (sub) => {
      const other = await request(app)
        .get(`/api/tickets/${otherTicketId}/${sub}`)
        .set('Cookie', cookies.REQUESTER)
      const missing = await request(app)
        .get(`/api/tickets/2000000000/${sub}`)
        .set('Cookie', cookies.REQUESTER)
      expect(other.status).toBe(404)
      expect(Object.keys(other.body)).toEqual(['error'])
      expect(other.body).toEqual(missing.body)
    },
  )
})

describe('SEC-03: a Requester cannot write an Action by any path (BR-12, AC-06)', () => {
  it('POST and PATCH on the staff and Requester Action paths are all non-2xx; nothing changes', async () => {
    const before = await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } })
    const count = await prisma.actionTaken.count({ where: { ticketId } })
    const write = { actionAt: new Date().toISOString(), description: 'Requester write attempt.' }
    const attempts = [
      request(app).post(`/api/staff/tickets/${ticketId}/actions`).send(write),
      request(app)
        .patch(`/api/staff/tickets/${ticketId}/actions/${actionId}`)
        .send({ version: 1, description: 'Changed by a Requester.' }),
      request(app).post(`/api/tickets/${ticketId}/actions`).send(write),
      request(app)
        .patch(`/api/tickets/${ticketId}/actions/${actionId}`)
        .send({ version: 1, description: 'Changed by a Requester.' }),
    ]
    for (const attempt of attempts) {
      const res = await attempt.set('Cookie', cookies.REQUESTER)
      expect(res.status).toBeGreaterThanOrEqual(400)
    }
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(count)
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } })).toEqual(before)
  })
})

describe('SEC-04: Internal Notes stay private on every Lab 4 Requester response (Lab 3 BR-04)', () => {
  it.each([
    () => `/api/tickets/${ticketId}`,
    () => `/api/tickets/${ticketId}/actions`,
    () => `/api/tickets/${ticketId}/status-history`,
    () => '/api/dashboard/requester',
  ])('%s never contains the note text', async (path) => {
    const res = await request(app).get(path()).set('Cookie', cookies.REQUESTER)
    expect(res.status).toBe(200)
    expect(res.text).not.toContain(NOTE)
  })

  it('the staff view of the same Ticket does contain it (the note exists)', async () => {
    const res = await request(app)
      .get(`/api/staff/tickets/${ticketId}`)
      .set('Cookie', cookies.IT_STAFF)
    expect(res.text).toContain(NOTE)
  })
})
