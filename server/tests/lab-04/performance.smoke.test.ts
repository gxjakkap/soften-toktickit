// PERF-01, PERF-02 (tests.md §2.5); BR-35, specification.md §7.3-4.
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import type { ActionStatus, TicketStatus } from '../../src/generated/prisma/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Issue #66: smoke checks on a developer machine, not load tests. The seeded
// database gains 2,000 Tickets and 6,000 Actions under TAG, and each timed
// call is the median of 10 so one slow outlier does not fail the run.

const TAG = 'lab4.performance.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`
const TICKETS = 2000
const ACTIONS_PER_TICKET = 3
const STATUSES: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CLOSED']
const ACTION_STATUSES: ActionStatus[] = ['PLANNED', 'IN_PROGRESS', 'DONE']

const cookies = { staff: '', requester: '' }
let staffId: number
let gateTicketId: number

async function medianMs(call: () => Promise<request.Response>) {
  const times: number[] = []
  for (let i = 0; i < 10; i++) {
    const start = performance.now()
    const res = await call()
    times.push(performance.now() - start)
    expect(res.status).toBe(200)
  }
  return times.sort((a, b) => a - b)[5]!
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const [staff, requester] = await Promise.all([
    prisma.user.create({
      data: { name: 'Perf staff', email: email('staff'), role: 'IT_STAFF', passwordHash },
    }),
    prisma.user.create({
      data: { name: 'Perf requester', email: email('requester'), role: 'REQUESTER', passwordHash },
    }),
  ])
  staffId = staff.id
  cookies.staff = await loginCookie(app, email('staff'), PASSWORD)
  cookies.requester = await loginCookie(app, email('requester'), PASSWORD)
  const categoryId = (await prisma.category.create({ data: { name: `Category ${TAG}` } })).id
  const relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } }))
    .id

  const tickets = await prisma.ticket.createManyAndReturn({
    data: Array.from({ length: TICKETS }, (_, i) => ({
      ticketNumber: `${TAG}-${i}`,
      requesterId: requester.id,
      ownerId: i % 3 === 0 ? null : staffId,
      categoryId,
      relatedSystemId,
      summary: `Performance fixture ${i}`,
      description: 'Fixture ticket for the performance smoke tests.',
      requestedPriority: 'MEDIUM' as const,
      itPriority: (['LOW', 'MEDIUM', 'HIGH'] as const)[i % 3],
      currentStatus: STATUSES[i % STATUSES.length]!,
      resolvedAt: STATUSES[i % STATUSES.length] === 'CLOSED' ? new Date() : null,
    })),
    select: { id: true },
  })
  await prisma.actionTaken.createMany({
    data: tickets.flatMap(({ id }, i) =>
      Array.from({ length: ACTIONS_PER_TICKET }, (_, j) => {
        const status = ACTION_STATUSES[(i + j) % ACTION_STATUSES.length]!
        return {
          ticketId: id,
          performedById: staffId,
          assignedToId: staffId,
          actionAt: new Date(Date.now() - (i + j) * 60_000),
          description: `Performance action ${i}-${j}`,
          result: status === 'DONE' ? 'Done.' : null,
          status,
          followUpRequired: j === 0 && i % 7 === 0,
          followUpNote: j === 0 && i % 7 === 0 ? 'Check back.' : null,
        }
      }),
    ),
  })

  // PERF-02: a resolvable Ticket with 50 Done Actions for the gate to read.
  gateTicketId = (
    await prisma.ticket.create({
      data: {
        ticketNumber: `${TAG}-gate`,
        requesterId: requester.id,
        ownerId: staffId,
        categoryId,
        relatedSystemId,
        summary: 'Performance gate fixture',
        description: 'Fixture ticket for the resolution gate timing.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: 'IN_PROGRESS',
      },
    })
  ).id
  await prisma.actionTaken.createMany({
    data: Array.from({ length: 50 }, (_, i) => ({
      ticketId: gateTicketId,
      performedById: staffId,
      assignedToId: staffId,
      actionAt: new Date(Date.now() - i * 60_000),
      description: `Gate action ${i}`,
      result: 'Done.',
      status: 'DONE' as const,
    })),
  })
}, 60_000)

afterAll(async () => {
  const mine = { ticket: { ticketNumber: { startsWith: TAG } } }
  await prisma.ticketStatusHistory.deleteMany({ where: mine })
  await prisma.actionTaken.deleteMany({ where: mine })
  await prisma.ticket.deleteMany({ where: mine.ticket })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
}, 60_000)

describe('PERF-01 dashboard latency', () => {
  it('staff dashboard median of 10 calls < 300 ms', async () => {
    const ms = await medianMs(() =>
      request(app).get('/api/dashboard/staff').set('Cookie', cookies.staff),
    )
    expect(ms).toBeLessThan(300)
  })

  it('requester dashboard median of 10 calls < 300 ms', async () => {
    const ms = await medianMs(() =>
      request(app).get('/api/dashboard/requester').set('Cookie', cookies.requester),
    )
    expect(ms).toBeLessThan(300)
  })
})

describe('PERF-02 gate and list latency', () => {
  it('Queue with followUp=pending&statusGroup=active median < 300 ms', async () => {
    const ms = await medianMs(() =>
      request(app)
        .get('/api/staff/tickets?followUp=pending&statusGroup=active')
        .set('Cookie', cookies.staff),
    )
    expect(ms).toBeLessThan(300)
  })

  it('resolving a Ticket with 50 Actions < 200 ms', async () => {
    const start = performance.now()
    const res = await request(app)
      .patch(`/api/staff/tickets/${gateTicketId}/status`)
      .set('Cookie', cookies.staff)
      .send({ status: 'RESOLVED', version: 1 })
    const ms = performance.now() - start
    expect(res.status).toBe(200)
    expect(ms).toBeLessThan(200)
  })
})
