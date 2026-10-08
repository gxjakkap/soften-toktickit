import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import type { ActionStatus, TicketStatus } from '../../src/generated/prisma/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { TICKET_STATUSES, canTransition } from '../../src/lib/ticket-status.js'
import { loginCookie } from '../helpers/auth.js'

// API-20..API-35 (AC-16..AC-26, AC-46): docs/lab-04
// api-spec.md §3 and specification.md §5.2-5.4 (BR-16..BR-24, BR-26,
// BR-29, BR-30). Every call goes straight to the API, so nothing here relies
// on the UI hiding an option. Most Actions Taken fixtures are written
// through Prisma; API-31, API-32, and API-34 use the Actions Taken endpoints.

const TAG = 'lab4.ticket-workflow.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`
const STATUSES = TICKET_STATUSES as TicketStatus[]

let staffId: number
let adminId: number
let requesterId: number
let otherRequesterId: number
let categoryId: number
let relatedSystemId: number
const cookies = { staff: '', staffB: '', admin: '', requester: '', otherRequester: '' }

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const make = (name: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR', isActive = true) =>
    prisma.user.create({
      data: { name: `Workflow ${name}`, email: email(name), role, passwordHash, isActive },
    })
  const [staff, , admin, requester, otherRequester] = await Promise.all([
    make('staff', 'IT_STAFF'),
    make('staffb', 'IT_STAFF'),
    make('admin', 'ADMINISTRATOR'),
    make('requester', 'REQUESTER'),
    make('other-requester', 'REQUESTER'),
    make('inactive-staff', 'IT_STAFF', false),
  ])
  staffId = staff.id
  adminId = admin.id
  requesterId = requester.id
  otherRequesterId = otherRequester.id
  cookies.staff = await loginCookie(app, email('staff'), PASSWORD)
  cookies.staffB = await loginCookie(app, email('staffb'), PASSWORD)
  cookies.admin = await loginCookie(app, email('admin'), PASSWORD)
  cookies.requester = await loginCookie(app, email('requester'), PASSWORD)
  cookies.otherRequester = await loginCookie(app, email('other-requester'), PASSWORD)

  categoryId = (await prisma.category.create({ data: { name: `Category ${TAG}` } })).id
  relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })).id
})

afterAll(async () => {
  const mine = { ticket: { requester: { email: { endsWith: TAG } } } }
  await prisma.ticketStatusHistory.deleteMany({ where: mine })
  await prisma.actionTaken.deleteMany({ where: mine })
  await prisma.ticketComment.deleteMany({ where: mine })
  await prisma.ticket.deleteMany({ where: mine.ticket })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
})

let seq = 0
async function createTicket(currentStatus: TicketStatus = 'NEW', owner = requesterId) {
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-WF-${Date.now()}-${seq++}`,
      requesterId: owner,
      categoryId,
      relatedSystemId,
      summary: 'Workflow fixture ticket',
      description: 'Workflow fixture ticket description.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus,
    },
  })
}

async function addAction(ticketId: number, status: ActionStatus, followUpRequired = false) {
  await prisma.actionTaken.create({
    data: {
      ticketId,
      performedById: staffId,
      assignedToId: staffId,
      actionAt: new Date(),
      description: `${status} fixture action`,
      result: status === 'DONE' ? 'Done.' : null,
      status,
      followUpRequired,
      followUpNote: followUpRequired ? 'Check back tomorrow.' : null,
    },
  })
}

const setStatus = (cookie: string, ticketId: number, status: string, version: unknown = 1) =>
  request(app)
    .patch(`/api/staff/tickets/${ticketId}/status`)
    .set('Cookie', cookie)
    .send({ version, status })

const historyOf = (ticketId: number) =>
  prisma.ticketStatusHistory.findMany({
    where: { ticketId },
    orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
  })

describe('API-20 (AC-21, BR-16): all 64 status pairs as IT Staff', () => {
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const))
  const permitted = pairs.filter(([from, to]) => canTransition(from, to))

  it('the matrix has exactly 17 permitted transitions', () => {
    expect(permitted).toHaveLength(17)
  })

  it.each(pairs)('%s -> %s', async (from, to) => {
    const ticket = await createTicket(from)
    if (to === 'RESOLVED') await addAction(ticket.id, 'DONE')
    const res = await setStatus(cookies.staff, ticket.id, to)
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })

    if (canTransition(from, to)) {
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: ticket.id, currentStatus: to, version: 2 })
      expect(after.currentStatus).toBe(to)
    } else {
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('INVALID_TRANSITION')
      expect(after).toMatchObject({ currentStatus: from, version: 1 })
      expect(await historyOf(ticket.id)).toHaveLength(0)
    }
  })

  it.each(permitted)('BR-29: an Administrator may also perform %s -> %s', async (from, to) => {
    const ticket = await createTicket(from)
    if (to === 'RESOLVED') await addAction(ticket.id, 'DONE')
    const res = await setStatus(cookies.admin, ticket.id, to)
    expect(res.status).toBe(200)
    expect(res.body.currentStatus).toBe(to)
  })
})

describe('API-27 (AC-22, BR-17): a Requester never changes status', () => {
  it.each(STATUSES)('403 to %s on their own and on another Requester’s Ticket', async (to) => {
    for (const owner of [requesterId, otherRequesterId]) {
      const ticket = await createTicket('IN_PROGRESS', owner)
      await addAction(ticket.id, 'DONE')
      const res = await setStatus(cookies.requester, ticket.id, to)
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
      expect(after).toMatchObject({ currentStatus: 'IN_PROGRESS', version: 1 })
    }
  })

  it('401 UNAUTHENTICATED with no session', async () => {
    const ticket = await createTicket('OPEN')
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .send({ version: 1, status: 'IN_PROGRESS' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('API-21..API-23 (AC-16..AC-18, BR-18, BR-19): resolution gate via direct API calls', () => {
  const cases: [string, [ActionStatus, boolean][], string[]][] = [
    ['no Actions', [], ['NO_DONE_ACTION']],
    ['only Cancelled', [['CANCELLED', false]], ['NO_DONE_ACTION']],
    [
      'Done + Planned',
      [
        ['DONE', false],
        ['PLANNED', false],
      ],
      ['OPEN_ACTIONS'],
    ],
    [
      'Done + In Progress',
      [
        ['DONE', false],
        ['IN_PROGRESS', false],
      ],
      ['OPEN_ACTIONS'],
    ],
    ['Done with a follow-up', [['DONE', true]], ['PENDING_FOLLOW_UPS']],
    [
      'all three failing',
      [
        ['PLANNED', true],
        ['CANCELLED', false],
      ],
      ['NO_DONE_ACTION', 'OPEN_ACTIONS', 'PENDING_FOLLOW_UPS'],
    ],
  ]

  for (const from of ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'] as const) {
    it.each(cases)(
      `${from} -> RESOLVED with %s is 409 RESOLUTION_BLOCKED`,
      async (_l, actions, reasons) => {
        const ticket = await createTicket(from)
        for (const [status, followUp] of actions) await addAction(ticket.id, status, followUp)

        const res = await setStatus(cookies.staff, ticket.id, 'RESOLVED')
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('RESOLUTION_BLOCKED')
        expect(res.body.error.details).toEqual({ reasons })
        expect(res.body.error.message).toMatch(/can't be resolved yet/)

        const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
        expect(after).toMatchObject({ currentStatus: from, version: 1, resolvedAt: null })
        expect(await historyOf(ticket.id)).toHaveLength(0)
      },
    )
  }

  it('a follow-up on a Cancelled Action does not block resolution', async () => {
    const ticket = await createTicket('IN_PROGRESS')
    await addAction(ticket.id, 'DONE')
    await addAction(ticket.id, 'CANCELLED', true)
    expect((await setStatus(cookies.staff, ticket.id, 'RESOLVED')).status).toBe(200)
  })
})

describe('API-24 (AC-19, BR-21, BR-22): successful resolve', () => {
  it('returns TicketWorkflowState, sets resolvedAt, bumps version, writes one history row', async () => {
    const ticket = await createTicket('IN_PROGRESS')
    await prisma.ticket.update({ where: { id: ticket.id }, data: { ownerId: staffId } })
    await addAction(ticket.id, 'DONE')

    const res = await setStatus(cookies.staff, ticket.id, 'RESOLVED')
    expect(res.status).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'currentStatus',
        'id',
        'itPriority',
        'ownerId',
        'ownerName',
        'resolvedAt',
        'updatedAt',
        'version',
      ].sort(),
    )
    expect(res.body).toMatchObject({
      id: ticket.id,
      version: 2,
      currentStatus: 'RESOLVED',
      ownerId: staffId,
      ownerName: 'Workflow staff',
      itPriority: 'MEDIUM',
    })
    expect(res.body.resolvedAt).toMatch(/Z$/)

    const history = await historyOf(ticket.id)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      fromStatus: 'IN_PROGRESS',
      toStatus: 'RESOLVED',
      changedById: staffId,
    })
    expect(history[0]!.changedAt.toISOString()).toBe(res.body.resolvedAt)
  })
})

describe('API-25 (AC-25, BR-21): reopen clears resolvedAt and the gate applies again', () => {
  it('Resolved -> Closed keeps it, Closed -> Reopened clears it, re-resolving needs the gate', async () => {
    const ticket = await createTicket('IN_PROGRESS')
    await addAction(ticket.id, 'DONE')

    const resolved = await setStatus(cookies.staff, ticket.id, 'RESOLVED', 1)
    const closed = await setStatus(cookies.staff, ticket.id, 'CLOSED', 2)
    expect(closed.status).toBe(200)
    expect(closed.body.resolvedAt).toBe(resolved.body.resolvedAt)

    const reopened = await setStatus(cookies.staff, ticket.id, 'REOPENED', 3)
    expect(reopened.status).toBe(200)
    expect(reopened.body.resolvedAt).toBeNull()

    expect((await setStatus(cookies.staff, ticket.id, 'IN_PROGRESS', 4)).status).toBe(200)
    await addAction(ticket.id, 'PLANNED')
    const blocked = await setStatus(cookies.staff, ticket.id, 'RESOLVED', 5)
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.details.reasons).toEqual(['OPEN_ACTIONS'])
  })
})

describe('API-26 (AC-20, BR-20): "Problem Appears Resolved" stays advisory', () => {
  it('records the indication only; status, resolvedAt, version, history, and gate are unchanged', async () => {
    const ticket = await createTicket('IN_PROGRESS')
    const detailBefore = await request(app)
      .get(`/api/staff/tickets/${ticket.id}`)
      .set('Cookie', cookies.staff)

    const res = await request(app)
      .patch(`/api/tickets/${ticket.id}/resolved`)
      .set('Cookie', cookies.requester)
    expect(res.status).toBe(200)
    expect(res.body.requesterConfirmedResolvedAt).toBeTruthy()

    const detailAfter = await request(app)
      .get(`/api/staff/tickets/${ticket.id}`)
      .set('Cookie', cookies.staff)
    expect(detailAfter.body).toMatchObject({
      currentStatus: 'IN_PROGRESS',
      resolvedAt: null,
      version: detailBefore.body.version,
      resolutionGate: detailBefore.body.resolutionGate,
    })
    expect(detailAfter.body.resolutionGate.canResolve).toBe(false)
    expect(await historyOf(ticket.id)).toHaveLength(0)

    // Still blocked: the Requester's indication satisfies no gate condition.
    const blocked = await setStatus(cookies.staff, ticket.id, 'RESOLVED')
    expect(blocked.body.error.code).toBe('RESOLUTION_BLOCKED')
  })
})

describe('API-28 (AC-23, BR-24, BR-26): concurrent status changes', () => {
  it('sequential: the second write with the old version is 409 STALE_UPDATE with the current state', async () => {
    const ticket = await createTicket('OPEN')
    expect((await setStatus(cookies.staff, ticket.id, 'IN_PROGRESS', 1)).status).toBe(200)

    const stale = await setStatus(cookies.staffB, ticket.id, 'CANCELLED', 1)
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatchObject({
      code: 'STALE_UPDATE',
      field: 'version',
      details: { current: { id: ticket.id, version: 2, currentStatus: 'IN_PROGRESS' } },
    })
    expect((await historyOf(ticket.id)).map((h) => h.toStatus)).toEqual(['IN_PROGRESS'])
  })

  it('parallel: exactly one of two same-version writes wins; one history row', async () => {
    const ticket = await createTicket('OPEN')
    const results = await Promise.all([
      setStatus(cookies.staff, ticket.id, 'IN_PROGRESS', 1),
      setStatus(cookies.staffB, ticket.id, 'WAITING_FOR_REQUESTER', 1),
    ])
    const ok = results.filter((r) => r.status === 200)
    const stale = results.filter((r) => r.status === 409)
    expect(ok).toHaveLength(1)
    expect(stale).toHaveLength(1)
    expect(stale[0]!.body.error.code).toBe('STALE_UPDATE')
    expect(stale[0]!.body.error.details.current.currentStatus).toBe(ok[0]!.body.currentStatus)

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
    expect(after).toMatchObject({ currentStatus: ok[0]!.body.currentStatus, version: 2 })
    expect(await historyOf(ticket.id)).toHaveLength(1)
  })
})

describe('API-29 (AC-46, BR-24): version on every workflow write', () => {
  const writes = {
    claim: {},
    owner: { ownerId: null },
    priority: { itPriority: 'HIGH' },
    status: { status: 'IN_PROGRESS' },
  } as const

  for (const [route, body] of Object.entries(writes)) {
    it(`${route}: missing or non-integer version is 400, stale is 409, success bumps it`, async () => {
      const ticket = await createTicket('OPEN')
      const url = `/api/staff/tickets/${ticket.id}/${route}`
      for (const version of [undefined, '1', 1.5, null]) {
        const res = await request(app)
          .patch(url)
          .set('Cookie', cookies.staff)
          .send({ ...body, version })
        expect(res.status).toBe(400)
        expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'version' })
      }

      const stale = await request(app)
        .patch(url)
        .set('Cookie', cookies.staff)
        .send({ ...body, version: 7 })
      expect(stale.status).toBe(409)
      expect(stale.body.error.code).toBe('STALE_UPDATE')
      expect(stale.body.error.details.current).toMatchObject({ id: ticket.id, version: 1 })

      const ok = await request(app)
        .patch(url)
        .set('Cookie', cookies.staff)
        .send({ ...body, version: 1 })
      expect(ok.status).toBe(200)
      expect(ok.body.version).toBe(2)

      const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
      expect(after.version).toBe(2)
    })
  }

  it('a repeat claim by the current owner checks version but does not bump it', async () => {
    const ticket = await createTicket('OPEN')
    const url = `/api/staff/tickets/${ticket.id}/claim`
    const first = await request(app).patch(url).set('Cookie', cookies.staff).send({ version: 1 })
    expect(first.body.version).toBe(2)

    const again = await request(app).patch(url).set('Cookie', cookies.staff).send({ version: 2 })
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ ownerId: staffId, version: 2 })

    const stale = await request(app).patch(url).set('Cookie', cookies.staff).send({ version: 1 })
    expect(stale.status).toBe(409)
  })
})

describe('API-30 (AC-24, BR-22): append-only, ordered history', () => {
  it('POST /api/tickets writes the null -> NEW creation entry', async () => {
    const res = await request(app).post('/api/tickets').set('Cookie', cookies.requester).send({
      categoryId,
      relatedSystemId,
      requestedPriority: 'LOW',
      summary: 'History creation entry fixture',
      description: 'Checks the creation history entry is written.',
    })
    expect(res.status).toBe(201)
    const history = await historyOf(res.body.id)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'NEW',
      changedById: requesterId,
    })
  })

  it('three changes give three entries, changedAt then id ascending, from both read endpoints', async () => {
    const ticket = await createTicket('NEW')
    await setStatus(cookies.staff, ticket.id, 'OPEN', 1)
    await setStatus(cookies.admin, ticket.id, 'IN_PROGRESS', 2)
    await setStatus(cookies.staff, ticket.id, 'WAITING_FOR_REQUESTER', 3)

    const staffRes = await request(app)
      .get(`/api/staff/tickets/${ticket.id}/status-history`)
      .set('Cookie', cookies.staff)
    expect(staffRes.status).toBe(200)
    expect(staffRes.body.data.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      'OPEN',
      'IN_PROGRESS',
      'WAITING_FOR_REQUESTER',
    ])
    expect(staffRes.body.data[0]).toEqual({
      id: expect.any(Number),
      fromStatus: 'NEW',
      toStatus: 'OPEN',
      changedBy: { id: staffId, name: 'Workflow staff', role: 'IT_STAFF' },
      changedAt: expect.stringMatching(/Z$/),
    })
    expect(staffRes.body.data[1].changedBy.role).toBe('ADMINISTRATOR')
    const sorted = [...staffRes.body.data].sort(
      (a: { changedAt: string; id: number }, b: { changedAt: string; id: number }) =>
        a.changedAt.localeCompare(b.changedAt) || a.id - b.id,
    )
    expect(staffRes.body.data).toEqual(sorted)

    const own = await request(app)
      .get(`/api/tickets/${ticket.id}/status-history`)
      .set('Cookie', cookies.requester)
    expect(own.status).toBe(200)
    expect(own.body).toEqual(staffRes.body)
  })

  it('ties on changedAt are broken by id', async () => {
    const ticket = await createTicket('NEW')
    const at = new Date('2026-10-06T04:05:00.000Z')
    for (const [fromStatus, toStatus] of [
      ['NEW', 'OPEN'],
      ['OPEN', 'IN_PROGRESS'],
    ] as const) {
      await prisma.ticketStatusHistory.create({
        data: { ticketId: ticket.id, fromStatus, toStatus, changedById: staffId, changedAt: at },
      })
    }
    const res = await request(app)
      .get(`/api/staff/tickets/${ticket.id}/status-history`)
      .set('Cookie', cookies.staff)
    const ids = res.body.data.map((h: { id: number }) => h.id)
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
  })

  it('a legacy Ticket returns an empty list', async () => {
    const ticket = await createTicket('OPEN')
    const res = await request(app)
      .get(`/api/staff/tickets/${ticket.id}/status-history`)
      .set('Cookie', cookies.staff)
    expect(res.body).toEqual({ data: [] })
  })

  it('no route edits or deletes a history entry', async () => {
    const ticket = await createTicket('NEW')
    await setStatus(cookies.staff, ticket.id, 'OPEN', 1)
    const [entry] = await historyOf(ticket.id)
    for (const base of [
      `/api/staff/tickets/${ticket.id}/status-history`,
      `/api/tickets/${ticket.id}/status-history`,
    ]) {
      for (const path of [base, `${base}/${entry!.id}`]) {
        for (const method of ['patch', 'put', 'delete', 'post'] as const) {
          const res = await request(app)[method](path).set('Cookie', cookies.admin).send({})
          expect(res.status).toBe(404)
        }
      }
    }
    expect(await historyOf(ticket.id)).toEqual([entry])
  })

  it('a Requester reading another Requester’s history gets 404; staff get 404 for a missing Ticket', async () => {
    const theirs = await createTicket('NEW', otherRequesterId)
    const res = await request(app)
      .get(`/api/tickets/${theirs.id}/status-history`)
      .set('Cookie', cookies.requester)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } })

    const missing = await request(app)
      .get('/api/staff/tickets/999999999/status-history')
      .set('Cookie', cookies.staff)
    expect(missing.status).toBe(404)
  })

  it('role guards: 401 with no session, 403 across roles', async () => {
    const ticket = await createTicket('NEW')
    const staffPath = `/api/staff/tickets/${ticket.id}/status-history`
    const requesterPath = `/api/tickets/${ticket.id}/status-history`
    expect((await request(app).get(staffPath)).status).toBe(401)
    expect((await request(app).get(requesterPath)).status).toBe(401)
    expect((await request(app).get(staffPath).set('Cookie', cookies.requester)).status).toBe(403)
    expect((await request(app).get(requesterPath).set('Cookie', cookies.staff)).status).toBe(403)
  })
})

describe('API-31 (BR-19): the gate reads Actions inside the status transaction', () => {
  it('never ends Resolved with an open Action when one is added in parallel (20 runs)', async () => {
    for (let run = 0; run < 20; run++) {
      const ticket = await createTicket('IN_PROGRESS')
      await addAction(ticket.id, 'DONE')
      const [resolve, create] = await Promise.all([
        setStatus(cookies.staff, ticket.id, 'RESOLVED'),
        request(app)
          .post(`/api/staff/tickets/${ticket.id}/actions`)
          .set('Cookie', cookies.staffB)
          .send({ actionAt: new Date().toISOString(), description: 'Parallel planned work.' }),
      ])
      const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
      const open = await prisma.actionTaken.count({
        where: { ticketId: ticket.id, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      })
      expect(after.currentStatus === 'RESOLVED' && open > 0).toBe(false)
      // Exactly one side wins: resolved first (create refused), or created first (resolve blocked).
      expect([resolve.status, create.status].sort()).toEqual(
        after.currentStatus === 'RESOLVED' ? [200, 409] : [201, 409],
      )
    }
  })
})

describe('API-32 (BR-23): cancelling with open Actions', () => {
  it('succeeds and leaves the Actions as they were', async () => {
    const ticket = await createTicket('IN_PROGRESS')
    await addAction(ticket.id, 'PLANNED')
    const res = await setStatus(cookies.staff, ticket.id, 'CANCELLED')
    expect(res.status).toBe(200)
    const actions = await prisma.actionTaken.findMany({ where: { ticketId: ticket.id } })
    expect(actions.map((a) => [a.status, a.version])).toEqual([['PLANNED', 1]])

    // BR-10: the Action is now read-only.
    const edit = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/actions/${actions[0]!.id}`)
      .set('Cookie', cookies.staff)
      .send({ version: 1, description: 'Changed after cancel.' })
    expect(edit.status).toBe(409)
    expect(edit.body.error.code).toBe('TICKET_NOT_ACTIONABLE')
  })
})

describe('API-33 (api-spec.md §3.5): Ticket Detail adds version, resolvedAt, resolutionGate', () => {
  it('matches the database and what the status endpoint decides', async () => {
    const ticket = await createTicket('IN_PROGRESS')
    await addAction(ticket.id, 'DONE', true)
    const detail = await request(app)
      .get(`/api/staff/tickets/${ticket.id}`)
      .set('Cookie', cookies.staff)
    expect(detail.body).toMatchObject({
      version: 1,
      resolvedAt: null,
      resolutionGate: { canResolve: false, reasons: ['PENDING_FOLLOW_UPS'] },
    })
    expect(detail.body).not.toHaveProperty('actionsTaken')
    const attempt = await setStatus(cookies.staff, ticket.id, 'RESOLVED')
    expect(attempt.body.error.details.reasons).toEqual(detail.body.resolutionGate.reasons)

    await prisma.actionTaken.updateMany({
      where: { ticketId: ticket.id },
      data: { followUpRequired: false, followUpNote: null },
    })
    const passing = await request(app)
      .get(`/api/staff/tickets/${ticket.id}`)
      .set('Cookie', cookies.staff)
    expect(passing.body.resolutionGate).toEqual({ canResolve: true, reasons: [] })
    expect((await setStatus(cookies.staff, ticket.id, 'RESOLVED')).status).toBe(200)
  })
})

describe('API-34 (AC-26, BR-29, BR-30): Administrator parity', () => {
  it('Queue, Detail, claim, reassign (to an Administrator), priority, status, comment, note', async () => {
    const ticket = await createTicket('NEW')
    const base = `/api/staff/tickets/${ticket.id}`
    const asAdmin = (method: 'get' | 'patch' | 'post', path: string, body?: object) =>
      request(app)[method](path).set('Cookie', cookies.admin).send(body)

    expect((await asAdmin('get', '/api/staff/tickets')).status).toBe(200)
    expect((await asAdmin('get', base)).status).toBe(200)

    const claim = await asAdmin('patch', `${base}/claim`, { version: 1 })
    expect(claim.body).toMatchObject({ ownerId: adminId, ownerName: 'Workflow admin', version: 2 })

    const reassign = await asAdmin('patch', `${base}/owner`, { version: 2, ownerId: staffId })
    expect(reassign.body).toMatchObject({ ownerId: staffId, version: 3 })
    const toAdmin = await asAdmin('patch', `${base}/owner`, { version: 3, ownerId: adminId })
    expect(toAdmin.body).toMatchObject({ ownerId: adminId, version: 4 })

    const priority = await asAdmin('patch', `${base}/priority`, { version: 4, itPriority: 'HIGH' })
    expect(priority.body).toMatchObject({ itPriority: 'HIGH', version: 5 })

    const status = await asAdmin('patch', `${base}/status`, { version: 5, status: 'OPEN' })
    expect(status.body).toMatchObject({ currentStatus: 'OPEN', version: 6 })

    for (const visibility of ['PUBLIC', 'INTERNAL']) {
      const res = await asAdmin('post', `${base}/comments`, { visibility, content: 'Admin here.' })
      expect(res.status).toBe(201)
    }

    const action = await asAdmin('post', `${base}/actions`, {
      actionAt: new Date().toISOString(),
      description: 'Admin recorded work.',
    })
    expect(action.status).toBe(201)
    expect(action.body.performedBy).toMatchObject({ id: adminId, role: 'ADMINISTRATOR' })
    const updated = await asAdmin('patch', `${base}/actions/${action.body.id}`, {
      version: 1,
      status: 'IN_PROGRESS',
    })
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({ status: 'IN_PROGRESS', version: 2 })
  })
})

describe('API-35 (BR-30, §11-15): assignable users list', () => {
  it('active IT Staff and Administrators with role, name ascending; no inactive or Requesters', async () => {
    const res = await request(app).get('/api/staff/it-staff-users').set('Cookie', cookies.admin)
    expect(res.status).toBe(200)
    const mine = res.body.filter((u: { name: string }) => u.name.startsWith('Workflow '))
    expect(mine).toEqual([
      { id: adminId, name: 'Workflow admin', role: 'ADMINISTRATOR' },
      { id: staffId, name: 'Workflow staff', role: 'IT_STAFF' },
      { id: expect.any(Number), name: 'Workflow staffb', role: 'IT_STAFF' },
    ])
    expect(res.body.every((u: { role: string }) => u.role !== 'REQUESTER')).toBe(true)
  })
})
