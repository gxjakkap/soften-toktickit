import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Issue #5, specification.md §5 (FR-07..11, BR-03, BR-16, BR-17, BR-21,
// BR-24..28, BR-30) and api-spec.md §3.1-3.3, §3.7, §3.8: Lab 2's Requester
// Ticket endpoints now derive identity from the authenticated session
// instead of a client-supplied requesterId, plus the new Public Comment and
// "Problem Appears Resolved" endpoints.

const TAG = 'lab3.requester-tickets.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`

let ownerId: number
let otherId: number
let staffId: number
let categoryId: number
let relatedSystemId: number

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const [owner, other, staff] = await Promise.all([
    prisma.user.create({
      data: { name: 'RT Owner', email: email('owner'), role: 'REQUESTER', passwordHash },
    }),
    prisma.user.create({
      data: { name: 'RT Other', email: email('other'), role: 'REQUESTER', passwordHash },
    }),
    prisma.user.create({
      data: { name: 'RT Staff', email: email('staff'), role: 'IT_STAFF', passwordHash },
    }),
  ])
  ownerId = owner.id
  otherId = other.id
  staffId = staff.id

  const category = await prisma.category.create({ data: { name: `Category ${TAG}` } })
  categoryId = category.id
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  relatedSystemId = relatedSystem.id
})

afterAll(async () => {
  await prisma.ticketComment.deleteMany({ where: { ticket: { requesterId: ownerId } } })
  await prisma.attachment.deleteMany({ where: { ticket: { requesterId: ownerId } } })
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, otherId] } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
})

async function ownerCookie() {
  return loginCookie(app, email('owner'))
}

async function createOwnedTicket(cookie: string) {
  const res = await request(app).post('/api/tickets').set('Cookie', cookie).send({
    categoryId,
    relatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'Session-owned fixture ticket',
    description: 'Ticket created to exercise session-derived ownership tests.',
  })
  return res.body.id as number
}

describe('POST /api/tickets (session-derived identity)', () => {
  it('401s with no session', async () => {
    const res = await request(app).post('/api/tickets').send({
      categoryId,
      relatedSystemId,
      requestedPriority: 'MEDIUM',
      summary: 'No session',
      description: 'Should be rejected before validation runs.',
    })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('403s for an authenticated IT Staff caller (BR-17: Requester role only)', async () => {
    const cookie = await loginCookie(app, email('staff'))
    const res = await request(app).post('/api/tickets').set('Cookie', cookie).send({
      categoryId,
      relatedSystemId,
      requestedPriority: 'MEDIUM',
      summary: 'Wrong role',
      description: 'IT Staff cannot file a Ticket.',
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('AC-03: ignores a client-supplied requesterId and files the Ticket under the session owner', async () => {
    const cookie = await ownerCookie()
    const res = await request(app).post('/api/tickets').set('Cookie', cookie).send({
      requesterId: otherId,
      categoryId,
      relatedSystemId,
      requestedPriority: 'MEDIUM',
      summary: 'Spoofed requesterId ignored',
      description: 'The body requesterId must never override the session identity.',
    })
    expect(res.status).toBe(201)
    expect(res.body.requesterId).toBe(ownerId)
  })

  it('BR-21: itPriority is copied from requestedPriority at creation', async () => {
    const cookie = await ownerCookie()
    const res = await request(app).post('/api/tickets').set('Cookie', cookie).send({
      categoryId,
      relatedSystemId,
      requestedPriority: 'HIGH',
      summary: 'IT Priority mirrors Requested Priority',
      description: 'Created to check itPriority is copied on creation.',
    })
    expect(res.status).toBe(201)
    expect(res.body.itPriority).toBe('HIGH')
  })

  it('400s VALIDATION_ERROR, not 500, on a body-less request (Express 5 leaves req.body undefined)', async () => {
    const cookie = await ownerCookie()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .set('Content-Type', 'text/plain')
      .send()

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/tickets (session-derived identity)', () => {
  it('401s with no session', async () => {
    const res = await request(app).get('/api/tickets')
    expect(res.status).toBe(401)
  })

  it('AC-03: a requesterId query param is ignored; only the session owner’s Tickets are returned', async () => {
    const ownerCk = await ownerCookie()
    await createOwnedTicket(ownerCk)

    const otherCk = await loginCookie(app, email('other'))
    const res = await request(app)
      .get('/api/tickets')
      .query({ requesterId: ownerId })
      .set('Cookie', otherCk)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('list items carry itPriority and ownerName (api-spec.md §3.2)', async () => {
    const cookie = await ownerCookie()
    await createOwnedTicket(cookie)

    const res = await request(app).get('/api/tickets').set('Cookie', cookie).query({ pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    for (const item of res.body.data) {
      expect(item).toHaveProperty('itPriority')
      expect(item).toHaveProperty('ownerName')
    }
  })
})

describe('GET /api/tickets/:id (session-derived identity)', () => {
  it('AC-03: 404s for a Ticket owned by a different Requester, even if their real id is guessed', async () => {
    const ownerCk = await ownerCookie()
    const ticketId = await createOwnedTicket(ownerCk)

    const otherCk = await loginCookie(app, email('other'))
    const res = await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', otherCk)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('response includes ownerName, itPriority, requesterConfirmedResolvedAt, and a PUBLIC-only comments array', async () => {
    const cookie = await ownerCookie()
    const ticketId = await createOwnedTicket(cookie)
    await prisma.ticketComment.create({
      data: { ticketId, authorId: ownerId, visibility: 'PUBLIC', content: 'Visible to me' },
    })
    await prisma.ticketComment.create({
      data: { ticketId, authorId: staffId, visibility: 'INTERNAL', content: 'Staff-only note' },
    })

    const res = await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.ownerName).toBeNull()
    expect(res.body.itPriority).toBe('MEDIUM')
    expect(res.body.requesterConfirmedResolvedAt).toBeNull()
    expect(res.body.comments).toHaveLength(1)
    expect(res.body.comments[0]).toMatchObject({
      authorName: 'RT Owner',
      authorRole: 'REQUESTER',
      content: 'Visible to me',
    })
    expect(
      res.body.comments.some((c: { content: string }) => c.content === 'Staff-only note'),
    ).toBe(false)
  })
})

describe('POST /api/tickets/:id/comments (FR-10, BR-26..28, BR-30)', () => {
  it('creates a PUBLIC comment with author/timestamp from the session, never the client', async () => {
    const cookie = await ownerCookie()
    const ticketId = await createOwnedTicket(cookie)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Cookie', cookie)
      .send({
        content: 'Please let me know if you need anything else.',
        visibility: 'INTERNAL',
        authorName: 'Someone else',
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      ticketId,
      authorName: 'RT Owner',
      authorRole: 'REQUESTER',
      visibility: 'PUBLIC',
      content: 'Please let me know if you need anything else.',
    })
    expect(res.body.createdAt).toBeTruthy()

    const stored = await prisma.ticketComment.findUnique({ where: { id: res.body.id } })
    expect(stored?.visibility).toBe('PUBLIC')
    expect(stored?.authorId).toBe(ownerId)
  })

  it('AC-21/BR-26: rejects whitespace-only content with a field-level error and inserts nothing', async () => {
    const cookie = await ownerCookie()
    const ticketId = await createOwnedTicket(cookie)
    const before = await prisma.ticketComment.count({ where: { ticketId } })

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Cookie', cookie)
      .send({ content: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('content')
    expect(await prisma.ticketComment.count({ where: { ticketId } })).toBe(before)
  })

  it('BR-26: rejects content over 2000 trimmed characters', async () => {
    const cookie = await ownerCookie()
    const ticketId = await createOwnedTicket(cookie)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Cookie', cookie)
      .send({ content: 'a'.repeat(2001) })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('content')
  })

  it('400s VALIDATION_ERROR, not 500, on a body-less request (Express 5 leaves req.body undefined)', async () => {
    const cookie = await ownerCookie()
    const ticketId = await createOwnedTicket(cookie)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Cookie', cookie)
      .set('Content-Type', 'text/plain')
      .send()

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('404s when the Ticket is not owned by the caller (no existence leak)', async () => {
    const ownerCk = await ownerCookie()
    const ticketId = await createOwnedTicket(ownerCk)

    const otherCk = await loginCookie(app, email('other'))
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Cookie', otherCk)
      .send({ content: 'Trying to comment on someone else’s Ticket' })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('403s for an authenticated non-Requester caller', async () => {
    const ownerCk = await ownerCookie()
    const ticketId = await createOwnedTicket(ownerCk)

    const staffCk = await loginCookie(app, email('staff'))
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Cookie', staffCk)
      .send({ content: 'IT Staff use a different endpoint' })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/tickets/:id/resolved (FR-11, BR-24, BR-25)', () => {
  it('sets requesterConfirmedResolvedAt and is idempotent', async () => {
    const cookie = await ownerCookie()
    const ticketId = await createOwnedTicket(cookie)

    const first = await request(app)
      .patch(`/api/tickets/${ticketId}/resolved`)
      .set('Cookie', cookie)
    expect(first.status).toBe(200)
    expect(first.body.id).toBe(ticketId)
    expect(first.body.requesterConfirmedResolvedAt).toBeTruthy()

    const second = await request(app)
      .patch(`/api/tickets/${ticketId}/resolved`)
      .set('Cookie', cookie)
    expect(second.status).toBe(200)
    expect(new Date(second.body.requesterConfirmedResolvedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.body.requesterConfirmedResolvedAt).getTime(),
    )

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
    expect(ticket?.currentStatus).toBe('NEW')
  })

  it('AC-14: 404s for a Ticket not owned by the caller', async () => {
    const ownerCk = await ownerCookie()
    const ticketId = await createOwnedTicket(ownerCk)

    const otherCk = await loginCookie(app, email('other'))
    const res = await request(app).patch(`/api/tickets/${ticketId}/resolved`).set('Cookie', otherCk)

    expect(res.status).toBe(404)
  })

  it('BR-25: 409s when the Ticket is Closed or Cancelled', async () => {
    const cookie = await ownerCookie()
    const ticketId = await createOwnedTicket(cookie)
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })

    const res = await request(app).patch(`/api/tickets/${ticketId}/resolved`).set('Cookie', cookie)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('TICKET_CLOSED')
  })

  it('403s for an authenticated non-Requester caller', async () => {
    const ownerCk = await ownerCookie()
    const ticketId = await createOwnedTicket(ownerCk)

    const staffCk = await loginCookie(app, email('staff'))
    const res = await request(app).patch(`/api/tickets/${ticketId}/resolved`).set('Cookie', staffCk)

    expect(res.status).toBe(403)
  })
})
