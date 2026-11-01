import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Issue #7, specification.md §5 (FR-13..17, BR-18..22, BR-40) and
// api-spec.md §4.2-4.6: IT Staff Ticket Detail retrieval, ownership
// (claim/reassign), IT Priority, and Current Status transitions.
//
// Lab 4 (docs/lab-04/tests.md §6): every claim/owner/priority/status call
// sends the Ticket `version` (BR-24, API-61..74); success bodies are now the
// TicketWorkflowState superset, so exact-shape checks use toMatchObject;
// fixtures for ->Resolved get a Done Action first (BR-18, API-71); an active
// Administrator is a valid owner and appears in the assignable list (BR-30,
// API-60, API-67).

const TAG = 'lab3.staff-ticket-detail.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`

let staffAId: number
let staffBId: number
let staffInactiveId: number
let adminId: number
let requesterId: number
let categoryId: number
let relatedSystemId: number
let staffACookie: string
let staffBCookie: string
let requesterCookie: string
let adminCookie: string

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const [staffA, staffB, staffInactive, requester, admin] = await Promise.all([
    prisma.user.create({
      data: { name: 'Detail Staff A', email: email('staff-a'), role: 'IT_STAFF', passwordHash },
    }),
    prisma.user.create({
      data: { name: 'Detail Staff B', email: email('staff-b'), role: 'IT_STAFF', passwordHash },
    }),
    prisma.user.create({
      data: {
        name: 'Detail Staff Inactive',
        email: email('staff-inactive'),
        role: 'IT_STAFF',
        passwordHash,
        isActive: false,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Detail Requester',
        email: email('requester'),
        role: 'REQUESTER',
        passwordHash,
      },
    }),
    prisma.user.create({
      data: { name: 'Detail Admin', email: email('admin'), role: 'ADMINISTRATOR', passwordHash },
    }),
  ])
  staffAId = staffA.id
  staffBId = staffB.id
  staffInactiveId = staffInactive.id
  requesterId = requester.id
  adminId = admin.id

  staffACookie = await loginCookie(app, email('staff-a'), PASSWORD)
  staffBCookie = await loginCookie(app, email('staff-b'), PASSWORD)
  requesterCookie = await loginCookie(app, email('requester'), PASSWORD)
  adminCookie = await loginCookie(app, email('admin'), PASSWORD)

  const category = await prisma.category.create({ data: { name: `Category ${TAG}` } })
  categoryId = category.id
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  relatedSystemId = relatedSystem.id
})

afterAll(async () => {
  await prisma.ticketComment.deleteMany({ where: { ticket: { requesterId } } })
  // Lab 4 BR-22: history and Action rows (FK Restrict) go before their Tickets.
  await prisma.ticketStatusHistory.deleteMany({ where: { ticket: { requesterId } } })
  await prisma.actionTaken.deleteMany({ where: { ticket: { requesterId } } })
  await prisma.ticket.deleteMany({ where: { requesterId } })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
})

type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
type Status =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'

async function createTicket(
  overrides: {
    ownerId?: number | null
    requestedPriority?: Priority
    itPriority?: Priority
    currentStatus?: Status
  } = {},
) {
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${TAG}-${Date.now()}-${Math.random()}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: 'Fixture ticket for Issue #7',
      description: 'Fixture ticket description long enough to pass validation minimums.',
      requestedPriority: overrides.requestedPriority ?? 'MEDIUM',
      itPriority: overrides.itPriority ?? 'MEDIUM',
      ownerId: overrides.ownerId,
      currentStatus: overrides.currentStatus,
    },
  })
}

// Lab 4 BR-18: a Done Action satisfies the resolution gate.
async function addDoneAction(ticketId: number) {
  await prisma.actionTaken.create({
    data: {
      ticketId,
      performedById: staffAId,
      assignedToId: staffAId,
      actionAt: new Date(),
      description: 'Fixed it.',
      result: 'Works now.',
      status: 'DONE',
    },
  })
}

describe('GET /api/staff/tickets/:id', () => {
  it('401s with no session', async () => {
    const res = await request(app).get('/api/staff/tickets/1')
    expect(res.status).toBe(401)
  })

  it('403 FORBIDDEN for a Requester caller', async () => {
    const ticket = await createTicket()
    const res = await request(app)
      .get(`/api/staff/tickets/${ticket.id}`)
      .set('Cookie', requesterCookie)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('404s for a nonexistent ticket', async () => {
    const res = await request(app).get('/api/staff/tickets/999999999').set('Cookie', staffACookie)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('BR-40: an Administrator may retrieve the detail, including Internal Notes', async () => {
    const ticket = await createTicket({ ownerId: staffAId })
    await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        authorId: staffAId,
        visibility: 'INTERNAL',
        content: 'Internal note.',
      },
    })

    const res = await request(app).get(`/api/staff/tickets/${ticket.id}`).set('Cookie', adminCookie)
    expect(res.status).toBe(200)
    expect(res.body.comments).toHaveLength(1)
    expect(res.body.comments[0].visibility).toBe('INTERNAL')
  })

  it('returns ownerId/ownerName and both comment visibilities for IT Staff', async () => {
    const ticket = await createTicket({ ownerId: staffAId })
    await prisma.ticketComment.createMany({
      data: [
        { ticketId: ticket.id, authorId: staffAId, visibility: 'PUBLIC', content: 'Public note.' },
        {
          ticketId: ticket.id,
          authorId: staffAId,
          visibility: 'INTERNAL',
          content: 'Internal note.',
        },
      ],
    })

    const res = await request(app)
      .get(`/api/staff/tickets/${ticket.id}`)
      .set('Cookie', staffACookie)
    expect(res.status).toBe(200)
    expect(res.body.ownerId).toBe(staffAId)
    expect(res.body.ownerName).toBe('Detail Staff A')
    expect(res.body.comments.map((c: { visibility: string }) => c.visibility).sort()).toEqual([
      'INTERNAL',
      'PUBLIC',
    ])
  })
})

describe('GET /api/staff/it-staff-users', () => {
  it('403 FORBIDDEN for a non-IT-Staff caller', async () => {
    const res = await request(app).get('/api/staff/it-staff-users').set('Cookie', requesterCookie)
    expect(res.status).toBe(403)
  })

  it('lists only active IT Staff and Administrators, ordered by name', async () => {
    const res = await request(app).get('/api/staff/it-staff-users').set('Cookie', staffACookie)
    expect(res.status).toBe(200)
    const ids = res.body.map((u: { id: number }) => u.id)
    expect(ids).toContain(staffAId)
    expect(ids).toContain(staffBId)
    expect(ids).toContain(adminId)
    expect(ids).not.toContain(staffInactiveId)
    expect(ids).not.toContain(requesterId)
  })
})

describe('PATCH /api/staff/tickets/:id/claim', () => {
  it('claims an unassigned ticket', async () => {
    const ticket = await createTicket()
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/claim`)
      .set('Cookie', staffACookie)
      .send({ version: 1 })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: ticket.id,
      ownerId: staffAId,
      ownerName: 'Detail Staff A',
    })
  })

  it('BR-19: claiming a ticket the caller already owns is a no-op success', async () => {
    const ticket = await createTicket({ ownerId: staffAId })
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/claim`)
      .set('Cookie', staffACookie)
      .send({ version: 1 })
    expect(res.status).toBe(200)
    expect(res.body.ownerId).toBe(staffAId)
  })

  it('AC-38/BR-19: claiming a ticket owned by someone else is rejected, naming Reassign', async () => {
    const ticket = await createTicket({ ownerId: staffAId })
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/claim`)
      .set('Cookie', staffBCookie)
      .send({ version: 1 })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ALREADY_OWNED')
    expect(res.body.error.message).toMatch(/reassign/i)

    const unchanged = await prisma.ticket.findUnique({ where: { id: ticket.id } })
    expect(unchanged?.ownerId).toBe(staffAId)
  })

  it('403 for a Requester caller, 404 for a missing ticket', async () => {
    const forbidden = await request(app)
      .patch('/api/staff/tickets/1/claim')
      .set('Cookie', requesterCookie)
    expect(forbidden.status).toBe(403)

    const notFound = await request(app)
      .patch('/api/staff/tickets/999999999/claim')
      .set('Cookie', staffACookie)
      .send({ version: 1 })
    expect(notFound.status).toBe(404)
  })
})

describe('PATCH /api/staff/tickets/:id/owner', () => {
  it('BR-20: reassigns to any active IT Staff id, including the caller', async () => {
    const ticket = await createTicket({ ownerId: staffAId })
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set('Cookie', staffBCookie)
      .send({ version: 1, ownerId: staffBId })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: ticket.id,
      ownerId: staffBId,
      ownerName: 'Detail Staff B',
    })
  })

  it('clears ownership back to unassigned with ownerId: null', async () => {
    const ticket = await createTicket({ ownerId: staffAId })
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set('Cookie', staffACookie)
      .send({ version: 1, ownerId: null })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: ticket.id, ownerId: null, ownerName: null })
  })

  it('Lab 4 BR-30: an active Administrator is a valid owner', async () => {
    const ticket = await createTicket()
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set('Cookie', staffACookie)
      .send({ version: 1, ownerId: adminId })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: ticket.id, ownerId: adminId, ownerName: 'Detail Admin' })
  })

  it('400 INVALID_OWNER for a Requester id, an inactive IT Staff id, or a nonexistent id', async () => {
    const ticket = await createTicket()
    for (const ownerId of [requesterId, staffInactiveId, 999999999]) {
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/owner`)
        .set('Cookie', staffACookie)
        .send({ version: 1, ownerId })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_OWNER')
    }
  })

  it('403 for a Requester caller, 404 for a missing ticket', async () => {
    const forbidden = await request(app)
      .patch('/api/staff/tickets/1/owner')
      .set('Cookie', requesterCookie)
      .send({ version: 1, ownerId: staffAId })
    expect(forbidden.status).toBe(403)

    const notFound = await request(app)
      .patch('/api/staff/tickets/999999999/owner')
      .set('Cookie', staffACookie)
      .send({ version: 1, ownerId: staffAId })
    expect(notFound.status).toBe(404)
  })
})

describe('PATCH /api/staff/tickets/:id/priority', () => {
  it('AC-17: updates itPriority and leaves requestedPriority unchanged', async () => {
    const ticket = await createTicket({ requestedPriority: 'LOW', itPriority: 'LOW' })
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/priority`)
      .set('Cookie', staffACookie)
      .send({ version: 1, itPriority: 'HIGH' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: ticket.id, itPriority: 'HIGH' })

    const unchanged = await prisma.ticket.findUnique({ where: { id: ticket.id } })
    expect(unchanged?.requestedPriority).toBe('LOW')
  })

  it('400 VALIDATION_ERROR for an invalid priority value', async () => {
    const ticket = await createTicket()
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/priority`)
      .set('Cookie', staffACookie)
      .send({ version: 1, itPriority: 'URGENT' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('403 for a Requester caller', async () => {
    const ticket = await createTicket()
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/priority`)
      .set('Cookie', requesterCookie)
      .send({ version: 1, itPriority: 'HIGH' })
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/staff/tickets/:id/status', () => {
  // specification.md §7's full matrix — every permitted transition succeeds.
  const permitted: [Status, Status][] = [
    ['NEW', 'OPEN'],
    ['NEW', 'IN_PROGRESS'],
    ['NEW', 'CANCELLED'],
    ['OPEN', 'IN_PROGRESS'],
    ['OPEN', 'WAITING_FOR_REQUESTER'],
    ['OPEN', 'CANCELLED'],
    ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'],
    ['IN_PROGRESS', 'RESOLVED'],
    ['IN_PROGRESS', 'CANCELLED'],
    ['WAITING_FOR_REQUESTER', 'IN_PROGRESS'],
    ['WAITING_FOR_REQUESTER', 'RESOLVED'],
    ['WAITING_FOR_REQUESTER', 'CANCELLED'],
    ['RESOLVED', 'CLOSED'],
    ['RESOLVED', 'REOPENED'],
    ['CLOSED', 'REOPENED'],
    ['REOPENED', 'OPEN'],
    ['REOPENED', 'IN_PROGRESS'],
  ]

  it.each(permitted)('allows %s -> %s', async (from, to) => {
    const ticket = await createTicket({ currentStatus: from })
    if (to === 'RESOLVED') await addDoneAction(ticket.id)
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set('Cookie', staffACookie)
      .send({ version: 1, status: to })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: ticket.id, currentStatus: to })
  })

  // A sample of disallowed transitions, including AC-18/AC-19's examples and
  // Cancelled's terminal state.
  const disallowed: [Status, Status][] = [
    ['NEW', 'CLOSED'],
    ['NEW', 'RESOLVED'],
    ['OPEN', 'RESOLVED'],
    ['OPEN', 'OPEN'],
    ['CLOSED', 'OPEN'],
    ['CANCELLED', 'OPEN'],
    ['CANCELLED', 'IN_PROGRESS'],
    ['REOPENED', 'RESOLVED'],
  ]

  it.each(disallowed)(
    'rejects %s -> %s as 409 INVALID_TRANSITION, status unchanged',
    async (from, to) => {
      const ticket = await createTicket({ currentStatus: from })
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', staffACookie)
        .send({ version: 1, status: to })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('INVALID_TRANSITION')

      const unchanged = await prisma.ticket.findUnique({ where: { id: ticket.id } })
      expect(unchanged?.currentStatus).toBe(from)
    },
  )

  it('AC-19: Resolved -> Reopened succeeds and the ticket is actionable again', async () => {
    const ticket = await createTicket({ currentStatus: 'RESOLVED' })
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set('Cookie', staffACookie)
      .send({ version: 1, status: 'REOPENED' })
    expect(res.status).toBe(200)
    expect(res.body.currentStatus).toBe('REOPENED')
  })

  it('400 VALIDATION_ERROR for an unrecognized status value, before any transition check', async () => {
    const ticket = await createTicket({ currentStatus: 'CANCELLED' })
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set('Cookie', staffACookie)
      .send({ version: 1, status: 'ARCHIVED' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('403 for a Requester caller, 404 for a missing ticket', async () => {
    const forbidden = await request(app)
      .patch('/api/staff/tickets/1/status')
      .set('Cookie', requesterCookie)
      .send({ version: 1, status: 'OPEN' })
    expect(forbidden.status).toBe(403)

    const notFound = await request(app)
      .patch('/api/staff/tickets/999999999/status')
      .set('Cookie', staffACookie)
      .send({ version: 1, status: 'OPEN' })
    expect(notFound.status).toBe(404)
  })
})
