import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// specification.md FR-06/FR-24, api-spec.md §0.1: a single table-driven pass
// over every protected endpoint, run as unauthenticated, Requester, IT
// Staff, and Administrator. Most individual role rejections already have a
// test next to the endpoint they guard (see each file's own role-guard
// `it`s); this file is the consolidated cross-check the handout asks for,
// and it closes the handful of role combinations that had no test anywhere
// else — found while building this matrix (Issue #10):
//   - GET /api/tickets, GET /api/tickets/:id: no role test existed at all,
//     only ownership (404) and 401 — IT_STAFF/ADMINISTRATOR now covered.
//   - POST/GET/PATCH attachment endpoints: same gap.
//   - POST /api/tickets (ADMINISTRATOR), POST /api/tickets/:id/comments
//     (ADMINISTRATOR), PATCH /api/tickets/:id/resolved (ADMINISTRATOR):
//     only IT_STAFF had been tried, not ADMINISTRATOR.
//   - GET /api/staff/it-staff-users: only REQUESTER had been tried; unlike
//     GET /api/staff/tickets/:id (BR-40), ADMINISTRATOR has no read-only
//     exception here and must also 403.
//   - GET /api/categories, GET /api/related-systems: 401-with-no-session
//     was covered (this issue, reference-data.api.test.ts), but no test
//     proved IT_STAFF/ADMINISTRATOR sessions — not just REQUESTER's — can
//     reach them (specification.md §12-12: any authenticated role).
//
// Lab 4 (docs/lab-04/tests.md §6): specification.md BR-29 supersedes Lab 3
// BR-40, so every /api/staff/* row now allows ADMINISTRATOR as well.
const TAG = 'lab3.authz-matrix.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'
const ALL_ROLES: Role[] = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']
const cookies: Record<Role, string> = { REQUESTER: '', IT_STAFF: '', ADMINISTRATOR: '' }

let ticketId: number
let attachmentId: number
let otherTicketId: number
let otherAttachmentId: number

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const [requester, staff, admin, other] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Matrix Requester',
        email: email('requester'),
        role: 'REQUESTER',
        passwordHash,
      },
    }),
    prisma.user.create({
      data: { name: 'Matrix Staff', email: email('staff'), role: 'IT_STAFF', passwordHash },
    }),
    prisma.user.create({
      data: { name: 'Matrix Admin', email: email('admin'), role: 'ADMINISTRATOR', passwordHash },
    }),
    prisma.user.create({
      data: {
        name: 'Matrix Other Requester',
        email: email('other'),
        role: 'REQUESTER',
        passwordHash,
      },
    }),
  ])
  cookies.REQUESTER = await loginCookie(app, requester.email)
  cookies.IT_STAFF = await loginCookie(app, staff.email)
  cookies.ADMINISTRATOR = await loginCookie(app, admin.email)
  const otherCookie = await loginCookie(app, other.email)

  const category = await prisma.category.create({ data: { name: `Category ${TAG}` } })
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  const body = {
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    requestedPriority: 'MEDIUM' as const,
    summary: 'Authorization matrix fixture ticket',
    description: 'Ticket created to exercise the full role-authorization matrix.',
  }

  const ticket = await request(app).post('/api/tickets').set('Cookie', cookies.REQUESTER).send(body)
  ticketId = ticket.body.id as number
  const attachment = await request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set('Cookie', cookies.REQUESTER)
    .attach('file', Buffer.from('matrix fixture'), 'matrix-fixture.png')
  attachmentId = attachment.body.id as number

  const otherTicket = await request(app).post('/api/tickets').set('Cookie', otherCookie).send(body)
  otherTicketId = otherTicket.body.id as number
  const otherAttachment = await request(app)
    .post(`/api/tickets/${otherTicketId}/attachments`)
    .set('Cookie', otherCookie)
    .attach('file', Buffer.from('matrix fixture, other requester'), 'other-matrix-fixture.png')
  otherAttachmentId = otherAttachment.body.id as number
})

afterAll(async () => {
  await prisma.ticketComment.deleteMany({
    where: { ticket: { requester: { email: { endsWith: TAG } } } },
  })
  await prisma.attachment.deleteMany({
    where: { ticket: { requester: { email: { endsWith: TAG } } } },
  })
  // Lab 4 BR-22: history rows (FK Restrict) go before their Tickets.
  await prisma.ticketStatusHistory.deleteMany({
    where: { ticket: { requester: { email: { endsWith: TAG } } } },
  })
  await prisma.ticket.deleteMany({ where: { requester: { email: { endsWith: TAG } } } })
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
    label: 'GET /api/categories',
    method: 'get',
    path: () => '/api/categories',
    allowed: ALL_ROLES,
  },
  {
    label: 'GET /api/related-systems',
    method: 'get',
    path: () => '/api/related-systems',
    allowed: ALL_ROLES,
  },
  {
    label: 'POST /api/tickets',
    method: 'post',
    path: () => '/api/tickets',
    allowed: ['REQUESTER'],
  },
  { label: 'GET /api/tickets', method: 'get', path: () => '/api/tickets', allowed: ['REQUESTER'] },
  {
    label: 'GET /api/tickets/:id',
    method: 'get',
    path: () => `/api/tickets/${ticketId}`,
    allowed: ['REQUESTER'],
  },
  {
    label: 'POST /api/tickets/:id/attachments',
    method: 'post',
    path: () => `/api/tickets/${ticketId}/attachments`,
    allowed: ['REQUESTER'],
  },
  {
    label: 'GET /api/attachments/:id/download',
    method: 'get',
    path: () => `/api/attachments/${attachmentId}/download`,
    allowed: ['REQUESTER'],
  },
  {
    label: 'PATCH /api/attachments/:id/remove',
    method: 'patch',
    path: () => `/api/attachments/${attachmentId}/remove`,
    allowed: ['REQUESTER'],
  },
  {
    label: 'POST /api/tickets/:id/comments',
    method: 'post',
    path: () => `/api/tickets/${ticketId}/comments`,
    allowed: ['REQUESTER'],
  },
  {
    label: 'PATCH /api/tickets/:id/resolved',
    method: 'patch',
    path: () => `/api/tickets/${ticketId}/resolved`,
    allowed: ['REQUESTER'],
  },
  {
    label: 'GET /api/staff/tickets',
    method: 'get',
    path: () => '/api/staff/tickets',
    allowed: ['IT_STAFF', 'ADMINISTRATOR'],
  },
  {
    label: 'GET /api/staff/tickets/:id',
    method: 'get',
    path: () => `/api/staff/tickets/${ticketId}`,
    allowed: ['IT_STAFF', 'ADMINISTRATOR'],
  },
  {
    label: 'GET /api/staff/it-staff-users',
    method: 'get',
    path: () => '/api/staff/it-staff-users',
    allowed: ['IT_STAFF', 'ADMINISTRATOR'],
  },
  {
    label: 'PATCH /api/staff/tickets/:id/claim',
    method: 'patch',
    path: () => `/api/staff/tickets/${ticketId}/claim`,
    allowed: ['IT_STAFF', 'ADMINISTRATOR'],
  },
  {
    label: 'PATCH /api/staff/tickets/:id/owner',
    method: 'patch',
    path: () => `/api/staff/tickets/${ticketId}/owner`,
    allowed: ['IT_STAFF', 'ADMINISTRATOR'],
  },
  {
    label: 'PATCH /api/staff/tickets/:id/priority',
    method: 'patch',
    path: () => `/api/staff/tickets/${ticketId}/priority`,
    allowed: ['IT_STAFF', 'ADMINISTRATOR'],
  },
  {
    label: 'PATCH /api/staff/tickets/:id/status',
    method: 'patch',
    path: () => `/api/staff/tickets/${ticketId}/status`,
    allowed: ['IT_STAFF', 'ADMINISTRATOR'],
  },
  {
    label: 'POST /api/staff/tickets/:id/comments',
    method: 'post',
    path: () => `/api/staff/tickets/${ticketId}/comments`,
    allowed: ['IT_STAFF', 'ADMINISTRATOR'],
  },
  {
    label: 'GET /api/admin/users',
    method: 'get',
    path: () => '/api/admin/users',
    allowed: ['ADMINISTRATOR'],
  },
  {
    label: 'POST /api/admin/users',
    method: 'post',
    path: () => '/api/admin/users',
    allowed: ['ADMINISTRATOR'],
  },
  {
    label: 'PATCH /api/admin/users/:id',
    method: 'patch',
    // The role check short-circuits before any id lookup; this matrix only
    // asserts the role guard, so an arbitrary id is fine (as users-admin.
    // api.test.ts's own matrix loop already does with a literal `1`).
    path: () => '/api/admin/users/1',
    allowed: ['ADMINISTRATOR'],
  },
  {
    label: 'PATCH /api/admin/users/:id/password',
    method: 'patch',
    path: () => '/api/admin/users/1/password',
    allowed: ['ADMINISTRATOR'],
  },
]

describe('authorization matrix: every protected endpoint x every role', () => {
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

    // PR #55 review: the loop above only ever generates a case for a
    // disallowed role, so an endpoint allowing every role (categories,
    // related-systems) got no role assertion at all beyond the 401 check -
    // restricting either one to REQUESTER-only still passed the whole file.
    // This closes that: every allowed role must actually reach the handler
    // (not get stopped at 401/403), which also catches an over-restrictive
    // guard the same way the loop above catches an over-permissive one.
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
})

describe('no existence leak for another Requester’s Ticket/Attachment (BR-16, FR-24)', () => {
  it('GET /api/tickets/:id for another Requester’s ticket 404s with no ticket content', async () => {
    const res = await request(app)
      .get(`/api/tickets/${otherTicketId}`)
      .set('Cookie', cookies.REQUESTER)
    expect(res.status).toBe(404)
    expect(Object.keys(res.body)).toEqual(['error'])
  })

  it('GET /api/attachments/:id/download for another Requester’s attachment 404s with no file leaked', async () => {
    const res = await request(app)
      .get(`/api/attachments/${otherAttachmentId}/download`)
      .set('Cookie', cookies.REQUESTER)
    expect(res.status).toBe(404)
    expect(res.headers['content-disposition']).toBeUndefined()
    expect(Object.keys(res.body)).toEqual(['error'])
  })

  it('PATCH /api/attachments/:id/remove for another Requester’s attachment 404s, nothing changed', async () => {
    const res = await request(app)
      .patch(`/api/attachments/${otherAttachmentId}/remove`)
      .set('Cookie', cookies.REQUESTER)
    expect(res.status).toBe(404)
    expect(Object.keys(res.body)).toEqual(['error'])

    const stillActive = await prisma.attachment.findUnique({ where: { id: otherAttachmentId } })
    expect(stillActive?.isRemoved).toBe(false)
  })

  it('an Internal Note is never present in a Requester-role response, even for their own ticket (BR-04, BR-29)', async () => {
    const posted = await request(app)
      .post(`/api/staff/tickets/${ticketId}/comments`)
      .set('Cookie', cookies.IT_STAFF)
      .send({ visibility: 'INTERNAL', content: 'Matrix fixture internal note' })
    // PR #55 review: without this, a silently-failing POST would make the
    // "never present" assertion below pass for the wrong reason.
    expect(posted.status).toBe(201)

    const res = await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', cookies.REQUESTER)
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain('Matrix fixture internal note')
  })
})
