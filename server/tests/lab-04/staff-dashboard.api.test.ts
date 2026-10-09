// API-43..API-52 (tests.md §2.2); AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-35.
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import type {
  ActionStatus,
  RequestedPriority,
  TicketStatus,
  UserRole,
} from '../../src/generated/prisma/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Issue #66, Lab 4 api-spec.md §5.2 and §4.1, specification.md BR-45..BR-55:
// the IT Staff Dashboard and the Ticket Queue drill-down filters. The
// dashboard counts every Ticket in the database (seed and other fixtures
// included), so global metrics are compared with independent Prisma queries
// on the same state, and "me" metrics with exact numbers for fresh fixture
// staff users.

const TAG = 'lab4.staff-dashboard.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`
// Literals, not imports, so the expected values independently restate BR-15
// and the enum orders.
const ACTIVE: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']
const STATUSES: TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]
const PRIORITIES: RequestedPriority[] = ['LOW', 'MEDIUM', 'HIGH']
const ROLES: UserRole[] = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']
const LONG_DESCRIPTION = 'x'.repeat(100)
const EXACT_80 = 'y'.repeat(80)

const ids = { s1: 0, s2: 0, s3: 0, admin: 0, requester: 0 }
const cookies = { s1: '', s2: '', s3: '', admin: '', requester: '' }
const t = {} as Record<
  't1' | 't2' | 't3' | 't4' | 't5' | 't6' | 't7' | 'yesterday' | 'today',
  number
>
let categoryId: number
let relatedSystemId: number
let seq = 0

async function makeTicket(
  currentStatus: TicketStatus,
  opts: { ownerId?: number | null; itPriority?: RequestedPriority; resolvedAt?: Date | null } = {},
) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `${TAG}-${++seq}`,
      requesterId: ids.requester,
      ownerId: opts.ownerId ?? null,
      categoryId,
      relatedSystemId,
      summary: `Staff dashboard fixture ${seq}`,
      description: 'Fixture ticket for the IT Staff Dashboard tests.',
      requestedPriority: 'MEDIUM',
      itPriority: opts.itPriority ?? 'MEDIUM',
      currentStatus,
      resolvedAt: opts.resolvedAt ?? null,
    },
  })
  return ticket.id
}

async function addAction(
  ticketId: number,
  assignedToId: number,
  status: ActionStatus,
  opts: { followUpRequired?: boolean; actionAt?: Date; description?: string } = {},
) {
  const action = await prisma.actionTaken.create({
    data: {
      ticketId,
      performedById: assignedToId,
      assignedToId,
      actionAt: opts.actionAt ?? new Date('2026-10-01T03:00:00.000Z'),
      description: opts.description ?? `${status} fixture action`,
      result: status === 'DONE' ? 'Done.' : null,
      status,
      followUpRequired: opts.followUpRequired ?? false,
      followUpNote: opts.followUpRequired ? 'Check back tomorrow.' : null,
    },
  })
  return action.id
}

const dashboard = (cookie: string) => request(app).get('/api/dashboard/staff').set('Cookie', cookie)
const queue = (cookie: string, query: string) =>
  request(app).get(`/api/staff/tickets?${query}`).set('Cookie', cookie)
// `drillDown` is a client route under `/staff/tickets`; its list is
// `GET /api/staff/tickets` with the same query string.
const followDrillDown = (cookie: string, drillDown: string) =>
  request(app).get(`/api${drillDown}`).set('Cookie', cookie)
const fixtureQueue = (query: string) => queue(cookies.s1, `search=${TAG}&pageSize=50&${query}`)

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const make = (name: string, role: UserRole) =>
    prisma.user.create({
      data: { name: `Dashboard ${name}`, email: email(name), role, passwordHash },
    })
  const [s1, s2, s3, admin, requester] = await Promise.all([
    make('s1', 'IT_STAFF'),
    make('s2', 'IT_STAFF'),
    make('s3', 'IT_STAFF'),
    make('admin', 'ADMINISTRATOR'),
    make('requester', 'REQUESTER'),
  ])
  Object.assign(ids, { s1: s1.id, s2: s2.id, s3: s3.id, admin: admin.id, requester: requester.id })
  for (const key of Object.keys(cookies) as (keyof typeof cookies)[]) {
    cookies[key] = await loginCookie(app, email(key), PASSWORD)
  }
  categoryId = (await prisma.category.create({ data: { name: `Category ${TAG}` } })).id
  relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })).id

  // t1: S1's, High, six open Actions for S1 (more than the list holds), one
  //     Done and one Cancelled-with-follow-up, neither of which counts.
  t.t1 = await makeTicket('IN_PROGRESS', { ownerId: ids.s1, itPriority: 'HIGH' })
  const tie = new Date('2026-10-02T03:00:00.000Z')
  await addAction(t.t1, ids.s1, 'PLANNED', { actionAt: tie, description: LONG_DESCRIPTION })
  await addAction(t.t1, ids.s1, 'IN_PROGRESS', { actionAt: tie, description: EXACT_80 })
  for (let day = 3; day <= 6; day++) {
    await addAction(t.t1, ids.s1, 'PLANNED', {
      actionAt: new Date(`2026-10-0${day}T03:00:00.000Z`),
    })
  }
  await addAction(t.t1, ids.s1, 'DONE')
  await addAction(t.t1, ids.s1, 'CANCELLED', { followUpRequired: true })
  // t2: S1's, Low, one open Action for S1 with a pending follow-up, the
  //     oldest open Action of all.
  t.t2 = await makeTicket('OPEN', { ownerId: ids.s1, itPriority: 'LOW' })
  await addAction(t.t2, ids.s1, 'PLANNED', {
    followUpRequired: true,
    actionAt: new Date('2026-09-30T03:00:00.000Z'),
  })
  // t3/t4: open Actions for S1 on non-active Tickets drop out (BR-23, BR-45).
  t.t3 = await makeTicket('CANCELLED', { ownerId: ids.s1 })
  await addAction(t.t3, ids.s1, 'PLANNED', { followUpRequired: true })
  t.t4 = await makeTicket('RESOLVED', {
    ownerId: ids.s2,
    resolvedAt: new Date('2026-01-01T00:00:00.000Z'),
  })
  await addAction(t.t4, ids.s1, 'IN_PROGRESS')
  // t5: unassigned and High; t6: S2's, with one open Action for S2;
  // t7: unassigned Reopened.
  t.t5 = await makeTicket('NEW', { itPriority: 'HIGH' })
  t.t6 = await makeTicket('WAITING_FOR_REQUESTER', { ownerId: ids.s2 })
  await addAction(t.t6, ids.s2, 'PLANNED')
  t.t7 = await makeTicket('REOPENED')
  // AC-29 boundary pair, on a day nothing else shares (and in the past, so
  // the faked clock below does not expire the test sessions):
  // 16:59:59.999Z is 14 Jan in Bangkok, 17:00:00.000Z is 15 Jan.
  t.yesterday = await makeTicket('RESOLVED', { resolvedAt: new Date('2025-01-14T16:59:59.999Z') })
  t.today = await makeTicket('CLOSED', { resolvedAt: new Date('2025-01-14T17:00:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  const mine = { ticket: { ticketNumber: { startsWith: TAG } } }
  await prisma.ticketStatusHistory.deleteMany({ where: mine })
  await prisma.actionTaken.deleteMany({ where: mine })
  await prisma.ticket.deleteMany({ where: mine.ticket })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
})

describe('API-43 wrong roles (AC-32)', () => {
  it('401 without a session', async () => {
    const res = await request(app).get('/api/dashboard/staff')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('403 for a Requester, with no metric in the body', async () => {
    const res = await dashboard(cookies.requester)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'FORBIDDEN' }) })
  })
})

describe('API-44 card values (BR-45..BR-50, AC-28)', () => {
  it('each global card equals an independent query on the same state', async () => {
    const res = await dashboard(cookies.s1)
    expect(res.status).toBe(200)
    const active = { currentStatus: { in: ACTIVE } }
    const [unassigned, followUps, high] = await Promise.all([
      prisma.ticket.count({ where: { ...active, ownerId: null } }),
      prisma.ticket.count({
        where: {
          ...active,
          actionsTaken: { some: { followUpRequired: true, NOT: { status: 'CANCELLED' } } },
        },
      }),
      prisma.ticket.count({ where: { ...active, itPriority: 'HIGH' } }),
    ])
    expect(res.body.metrics.unassigned.value).toBe(unassigned)
    expect(res.body.metrics.followUpsPending.value).toBe(followUps)
    expect(res.body.metrics.highPriority.value).toBe(high)
  })

  it('"me" cards are the caller’s own and differ between two IT Staff', async () => {
    const [one, two] = await Promise.all([dashboard(cookies.s1), dashboard(cookies.s2)])
    // S1: 6 open on t1 + 1 on t2; t3 (Cancelled) and t4 (Resolved) excluded.
    expect(one.body.metrics.myOpenActions).toEqual({
      value: 7,
      ticketCount: 2,
      drillDown: `/staff/tickets?openActionAssigneeId=${ids.s1}&statusGroup=active`,
    })
    expect(one.body.metrics.myActiveTickets).toEqual({
      value: 2,
      drillDown: `/staff/tickets?ownerId=${ids.s1}&statusGroup=active`,
    })
    // S2: owns t4 (Resolved, not active) and t6; one open Action on t6.
    expect(two.body.metrics.myOpenActions.value).toBe(1)
    expect(two.body.metrics.myOpenActions.ticketCount).toBe(1)
    expect(two.body.metrics.myActiveTickets.value).toBe(1)
  })
})

describe('API-45 Action metric edges (BR-45, BR-48, BR-23)', () => {
  it('ignores open Actions on Cancelled and Resolved Tickets, and Cancelled follow-ups', async () => {
    const res = await fixtureQueue('followUp=pending&statusGroup=active')
    // t2 only: t1's follow-up is on a Cancelled Action; t3 is Cancelled.
    expect(res.body.data.map((x: { id: number }) => x.id)).toEqual([t.t2])
    const mine = await fixtureQueue(`openActionAssigneeId=${ids.s1}&statusGroup=active`)
    expect(mine.body.data.map((x: { id: number }) => x.id).sort()).toEqual([t.t1, t.t2].sort())
  })
})

describe('API-46 Resolved Today boundary (BR-50, BR-34, AC-29)', () => {
  it('counts 17:00:00.000Z as today and 16:59:59.999Z as yesterday in Bangkok', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2025-01-15T05:00:00.000Z')) // 12:00 Bangkok, 15 Jan
    const res = await dashboard(cookies.s1)
    expect(res.body.today).toBe('2025-01-15')
    expect(res.body.metrics.resolvedToday).toEqual({
      value: 1,
      drillDown: '/staff/tickets?resolvedFrom=2025-01-15&resolvedTo=2025-01-15',
    })
    const list = await followDrillDown(cookies.s1, res.body.metrics.resolvedToday.drillDown)
    expect(list.body.data.map((x: { id: number }) => x.id)).toEqual([t.today])
  })

  it('a Ticket resolved and closed today counts; one reopened today does not', async () => {
    const ticketId = await makeTicket('IN_PROGRESS', { ownerId: ids.s1 })
    await addAction(ticketId, ids.s1, 'DONE')
    const resolvedToday = async () => (await dashboard(cookies.s1)).body.metrics.resolvedToday.value
    const move = async (status: TicketStatus) => {
      const { version } = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticketId}/status`)
        .set('Cookie', cookies.s1)
        .send({ status, version })
      expect(res.status).toBe(200)
    }

    const before = await resolvedToday()
    await move('RESOLVED')
    expect(await resolvedToday()).toBe(before + 1)
    await move('CLOSED')
    expect(await resolvedToday()).toBe(before + 1)
    await move('REOPENED')
    expect(await resolvedToday()).toBe(before)
    // The history still records the resolution; the metric follows
    // resolvedAt, which Reopened cleared (BR-21, specification.md §7.3-2).
    const history = await prisma.ticketStatusHistory.findMany({ where: { ticketId } })
    expect(history.map((h) => h.toStatus)).toEqual(['RESOLVED', 'CLOSED', 'REOPENED'])

    // Now an active Ticket; drop it so the fixture counts below stay exact.
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId } })
    await prisma.actionTaken.deleteMany({ where: { ticketId } })
    await prisma.ticket.delete({ where: { id: ticketId } })
  })
})

describe('API-47 breakdowns (BR-51, BR-52)', () => {
  it('all 8 statuses and 3 priorities, enum order, zeros included, matching the database', async () => {
    const res = await dashboard(cookies.s1)
    expect(res.body.byStatus.map((e: { status: string }) => e.status)).toEqual(STATUSES)
    for (const entry of res.body.byStatus) {
      expect(entry.value).toBe(
        await prisma.ticket.count({ where: { currentStatus: entry.status } }),
      )
      expect(entry.drillDown).toBe(`/staff/tickets?status=${entry.status}`)
    }
    expect(res.body.activeByItPriority.map((e: { itPriority: string }) => e.itPriority)).toEqual(
      PRIORITIES,
    )
    for (const entry of res.body.activeByItPriority) {
      expect(entry.value).toBe(
        await prisma.ticket.count({
          where: { itPriority: entry.itPriority, currentStatus: { in: ACTIVE } },
        }),
      )
      expect(entry.drillDown).toBe(
        `/staff/tickets?itPriority=${entry.itPriority}&statusGroup=active`,
      )
    }
  })
})

describe('API-48 lists (BR-53, BR-54, AC-35)', () => {
  it('My Open Actions: 5 oldest by actionAt then id, truncated description, documented fields', async () => {
    const res = await dashboard(cookies.s1)
    const list = res.body.myOpenActionList
    expect(list).toHaveLength(5)
    const expected = await prisma.actionTaken.findMany({
      where: {
        assignedToId: ids.s1,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        ticket: { currentStatus: { in: ACTIVE } },
      },
      orderBy: [{ actionAt: 'asc' }, { id: 'asc' }],
      take: 5,
    })
    expect(list.map((a: { actionId: number }) => a.actionId)).toEqual(expected.map((a) => a.id))
    expect(list[0].ticketId).toBe(t.t2)
    // The tied pair on 2 Oct: lower id first, long text cut to 80 with "…",
    // exactly-80 text untouched.
    expect(list[1].description).toBe(`${'x'.repeat(79)}…`)
    expect(list[1].description).toHaveLength(80)
    expect(list[2].description).toBe(EXACT_80)
    for (const item of list) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'actionAt',
          'actionId',
          'description',
          'drillDown',
          'status',
          'ticketId',
          'ticketNumber',
        ].sort(),
      )
      expect(item.drillDown).toBe(`/staff/tickets/${item.ticketId}#actions-taken`)
    }
  })

  it('Recently Updated: 5 newest by updatedAt then id, owner name or null, documented fields', async () => {
    const res = await dashboard(cookies.s1)
    const expected = await prisma.ticket.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 5,
      include: { owner: true },
    })
    expect(res.body.recentlyUpdated).toEqual(
      expected.map((x) => ({
        id: x.id,
        ticketNumber: x.ticketNumber,
        summary: x.summary,
        currentStatus: x.currentStatus,
        ownerName: x.owner?.name ?? null,
        updatedAt: x.updatedAt.toISOString(),
      })),
    )
  })
})

describe('API-49 Administrator user counts (BR-55, FR-14, AC-33)', () => {
  it('Administrator gets userAccounts per role and active state', async () => {
    const res = await dashboard(cookies.admin)
    expect(res.status).toBe(200)
    for (const role of ROLES) {
      const [active, inactive] = await Promise.all([
        prisma.user.count({ where: { role, isActive: true } }),
        prisma.user.count({ where: { role, isActive: false } }),
      ])
      expect(res.body.userAccounts[role]).toEqual({
        active,
        inactive,
        drillDown: `/admin/users?role=${role}`,
      })
    }
  })

  it('Administrator gets the same staff metrics as IT Staff', async () => {
    const res = await dashboard(cookies.admin)
    expect(Object.keys(res.body.metrics)).toEqual([
      'myOpenActions',
      'unassigned',
      'myActiveTickets',
      'followUpsPending',
      'highPriority',
      'resolvedToday',
    ])
  })

  it('IT Staff get no userAccounts key at all', async () => {
    const res = await dashboard(cookies.s1)
    expect(res.body).not.toHaveProperty('userAccounts')
  })
})

describe('API-50 drill-down equals list (BR-38, AC-30)', () => {
  it.each(['s1', 's2', 's3', 'admin'] as const)('every card and breakdown for %s', async (who) => {
    const res = await dashboard(cookies[who])
    const { myOpenActions, ...cards } = res.body.metrics
    const links: { value: number; drillDown: string }[] = [
      // BR-45 is the documented exception: its list holds the Tickets.
      { value: myOpenActions.ticketCount, drillDown: myOpenActions.drillDown },
      ...Object.values(cards as Record<string, { value: number; drillDown: string }>),
      ...res.body.byStatus,
      ...res.body.activeByItPriority,
    ]
    for (const { value, drillDown } of links) {
      const list = await followDrillDown(cookies[who], drillDown)
      expect(list.status, drillDown).toBe(200)
      expect(list.body.totalCount, drillDown).toBe(value)
    }
  })
})

describe('API-51 Queue drill-down filters (api-spec.md §4.1)', () => {
  const idsOf = (res: request.Response) => res.body.data.map((x: { id: number }) => x.id)

  it('statusGroup=active keeps active statuses only, and ANDs with status', async () => {
    const res = await fixtureQueue('statusGroup=active')
    expect(idsOf(res).sort()).toEqual([t.t1, t.t2, t.t5, t.t6, t.t7].sort())
    expect((await fixtureQueue('statusGroup=active&status=RESOLVED')).body.totalCount).toBe(0)
    expect(idsOf(await fixtureQueue('statusGroup=active&status=REOPENED'))).toEqual([t.t7])
  })

  it('resolvedFrom/resolvedTo are inclusive Bangkok dates', async () => {
    expect(idsOf(await fixtureQueue('resolvedFrom=2025-01-15&resolvedTo=2025-01-15'))).toEqual([
      t.today,
    ])
    expect(idsOf(await fixtureQueue('resolvedFrom=2025-01-14&resolvedTo=2025-01-14'))).toEqual([
      t.yesterday,
    ])
    expect(
      idsOf(await fixtureQueue('resolvedFrom=2025-01-14&resolvedTo=2025-01-15')).sort(),
    ).toEqual([t.yesterday, t.today].sort())
    expect(idsOf(await fixtureQueue('resolvedFrom=2025-12-31&resolvedTo=2026-01-01'))).toEqual([
      t.t4,
    ])
  })

  it('followUp=pending and openActionAssigneeId filter on Actions; an unknown id is an empty list', async () => {
    expect(idsOf(await fixtureQueue('followUp=pending')).sort()).toEqual([t.t2, t.t3].sort())
    expect(idsOf(await fixtureQueue(`openActionAssigneeId=${ids.s1}`)).sort()).toEqual(
      [t.t1, t.t2, t.t3, t.t4].sort(),
    )
    const unknown = await fixtureQueue('openActionAssigneeId=999999999')
    expect(unknown.status).toBe(200)
    expect(unknown.body.totalCount).toBe(0)
  })

  it('sortBy=resolvedAt puts nulls last in both directions', async () => {
    const resolved = [t.yesterday, t.today, t.t4]
    const asc = idsOf(await fixtureQueue('sortBy=resolvedAt&sortDir=asc'))
    const desc = idsOf(await fixtureQueue('sortBy=resolvedAt&sortDir=desc'))
    expect(asc.slice(0, 3)).toEqual(resolved)
    expect(desc.slice(0, 3)).toEqual([...resolved].reverse())
  })

  it.each([
    ['statusGroup=all', 'statusGroup'],
    ['resolvedFrom=2026-02-30', 'resolvedFrom'],
    ['resolvedTo=tomorrow', 'resolvedTo'],
    ['resolvedFrom=2026-10-07&resolvedTo=2026-10-06', 'resolvedTo'],
    ['followUp=done', 'followUp'],
    ['openActionAssigneeId=abc', 'openActionAssigneeId'],
    ['openActionAssigneeId=-1', 'openActionAssigneeId'],
    ['openActionAssigneeId=', 'openActionAssigneeId'],
    ['sortBy=description', 'sortBy'],
  ])('%s → 400 INVALID_FILTER on %s', async (query, field) => {
    const res = await queue(cookies.s1, query)
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual(expect.objectContaining({ code: 'INVALID_FILTER', field }))
  })

  it('leaves the unfiltered Queue unchanged: every Ticket, createdAt ascending', async () => {
    const res = await queue(cookies.s1, 'pageSize=50')
    expect(res.body.totalCount).toBe(await prisma.ticket.count())
    const expected = await prisma.ticket.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
    })
    expect(idsOf(res)).toEqual(expected.map((x) => x.id))
  })
})

describe('API-52 zero metrics (BR-37, AC-31)', () => {
  it('a caller with no owned Tickets and no Actions gets 0s and an empty list', async () => {
    const res = await dashboard(cookies.s3)
    expect(res.status).toBe(200)
    expect(res.body.metrics.myOpenActions).toEqual({
      value: 0,
      ticketCount: 0,
      drillDown: `/staff/tickets?openActionAssigneeId=${ids.s3}&statusGroup=active`,
    })
    expect(res.body.metrics.myActiveTickets.value).toBe(0)
    expect(res.body.myOpenActionList).toEqual([])
    for (const entry of [...res.body.byStatus, ...res.body.activeByItPriority]) {
      expect(typeof entry.value).toBe('number')
    }
  })
})
