// API-36..API-42 (tests.md §2.2); AC-02, AC-28, AC-30, AC-31, AC-32, AC-35.
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import type { TicketStatus } from '../../src/generated/prisma/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Issue #66, Lab 4 api-spec.md §5.1 and §4.2, specification.md BR-39..BR-44:
// the Requester Dashboard and the My Tickets drill-down filters. Every
// Requester is a fresh fixture user, so counts are exact and the seed's
// Tickets never leak in.

const TAG = 'lab4.requester-dashboard.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`
const DAY = 24 * 60 * 60 * 1000
// Written as literals rather than imported, so the expected values are an
// independent reading of BR-15 and not the code under test.
const ACTIVE: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']

const ids = { a: 0, b: 0, empty: 0, boundary: 0 }
const cookies = { a: '', b: '', empty: '', boundary: '', staff: '', admin: '' }
let categoryId: number
let relatedSystemId: number
let seq = 0
const tiedIds: number[] = []

async function makeTicket(
  requesterId: number,
  currentStatus: TicketStatus,
  opts: { resolvedAt?: Date | null; updatedAt?: Date } = {},
) {
  return prisma.ticket.create({
    data: {
      ticketNumber: `${TAG}-${++seq}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Requester dashboard fixture ${seq}`,
      description: 'Fixture ticket for the Requester Dashboard tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus,
      resolvedAt: opts.resolvedAt ?? null,
      updatedAt: opts.updatedAt ?? new Date(),
    },
  })
}

const dashboard = (cookie: string, query = '') =>
  request(app).get(`/api/dashboard/requester${query}`).set('Cookie', cookie)

// `drillDown` is a client route under `/tickets`; the list it opens is
// served by `GET /api/tickets` with the same query string.
const followDrillDown = (cookie: string, drillDown: string) =>
  request(app).get(`/api${drillDown}`).set('Cookie', cookie)

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const make = (name: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') =>
    prisma.user.create({
      data: { name: `Dashboard ${name}`, email: email(name), role, passwordHash },
    })
  const [a, b, empty, boundary] = await Promise.all([
    make('a', 'REQUESTER'),
    make('b', 'REQUESTER'),
    make('empty', 'REQUESTER'),
    make('boundary', 'REQUESTER'),
    make('staff', 'IT_STAFF'),
    make('admin', 'ADMINISTRATOR'),
  ])
  Object.assign(ids, { a: a.id, b: b.id, empty: empty.id, boundary: boundary.id })
  for (const key of Object.keys(cookies) as (keyof typeof cookies)[]) {
    cookies[key] = await loginCookie(app, email(key), PASSWORD)
  }
  categoryId = (await prisma.category.create({ data: { name: `Category ${TAG}` } })).id
  relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })).id

  const now = Date.now()
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60 * 1000)
  // Requester A: every kind of status, including a Reopened Ticket (no
  // resolvedAt, BR-21) and a Closed one outside the 30-day window. Two
  // Tickets share an updatedAt to exercise the id tie-break.
  const tie = at(5)
  await makeTicket(ids.a, 'NEW', { updatedAt: at(60) })
  for (const status of ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'] as const) {
    tiedIds.push((await makeTicket(ids.a, status, { updatedAt: tie })).id)
  }
  await makeTicket(ids.a, 'WAITING_FOR_REQUESTER', { updatedAt: at(30) })
  await makeTicket(ids.a, 'REOPENED', { updatedAt: at(1) })
  await makeTicket(ids.a, 'RESOLVED', { resolvedAt: new Date(now - DAY), updatedAt: at(20) })
  await makeTicket(ids.a, 'CLOSED', { resolvedAt: new Date(now - 10 * DAY), updatedAt: at(90) })
  await makeTicket(ids.a, 'CLOSED', { resolvedAt: new Date(now - 40 * DAY), updatedAt: at(120) })
  await makeTicket(ids.a, 'CANCELLED', { updatedAt: at(10) })
  // Requester B: nothing waiting.
  await makeTicket(ids.b, 'OPEN')
  await makeTicket(ids.b, 'RESOLVED', { resolvedAt: new Date(now - 2 * DAY) })
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  const mine = { requester: { email: { endsWith: TAG } } }
  await prisma.ticket.deleteMany({ where: mine })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
})

// Independent reading of BR-39..BR-42 for one Requester at `now`.
async function expectedMetrics(requesterId: number, now: Date) {
  // 00:00 Bangkok today is 17:00Z of the previous UTC day or of today.
  const bangkokNow = new Date(now.getTime() + 7 * 3600 * 1000)
  const todayStart = new Date(
    Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate()) -
      7 * 3600 * 1000,
  )
  const windowStart = new Date(todayStart.getTime() - 29 * DAY)
  const [open, waiting, resolved] = await Promise.all([
    prisma.ticket.count({ where: { requesterId, currentStatus: { in: ACTIVE } } }),
    prisma.ticket.count({ where: { requesterId, currentStatus: 'WAITING_FOR_REQUESTER' } }),
    prisma.ticket.count({ where: { requesterId, resolvedAt: { gte: windowStart } } }),
  ])
  return { open, waiting, resolved }
}

describe('API-37 wrong roles (AC-32)', () => {
  it('401 without a session', async () => {
    const res = await request(app).get('/api/dashboard/requester')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it.each(['staff', 'admin'] as const)('403 for %s, with no metric in the body', async (who) => {
    const res = await dashboard(cookies[who])
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'FORBIDDEN' }) })
  })
})

describe('API-36 ownership (AC-02, BR-31)', () => {
  it('counts and lists only the caller’s own Tickets', async () => {
    for (const who of ['a', 'b'] as const) {
      const res = await dashboard(cookies[who])
      expect(res.status).toBe(200)
      const own = await prisma.ticket.findMany({ where: { requesterId: ids[who] } })
      const ownIds = new Set(own.map((t) => t.id))
      for (const item of [...res.body.recentlyUpdated, ...res.body.recentlyResolved]) {
        expect(ownIds.has(item.id)).toBe(true)
      }
      const expected = await expectedMetrics(ids[who], new Date(res.body.generatedAt))
      expect(res.body.metrics.openTickets.value).toBe(expected.open)
    }
  })

  it('ignores ?requesterId= pointing at another Requester', async () => {
    const plain = await dashboard(cookies.b)
    const spoofed = await dashboard(cookies.b, `?requesterId=${ids.a}`)
    const { generatedAt: _a, ...plainBody } = plain.body
    const { generatedAt: _b, ...spoofedBody } = spoofed.body
    expect(spoofedBody).toEqual(plainBody)
    expect(spoofedBody.metrics.openTickets.value).toBe(1)
  })
})

describe('API-38 metric values (BR-39, BR-41, BR-42, AC-28)', () => {
  it('each metric equals an independent count on the fixture', async () => {
    const res = await dashboard(cookies.a)
    const expected = await expectedMetrics(ids.a, new Date(res.body.generatedAt))
    expect(res.body.metrics.openTickets.value).toBe(expected.open)
    expect(res.body.metrics.waitingForYou.value).toBe(expected.waiting)
    expect(res.body.metrics.resolvedLast30Days.value).toBe(expected.resolved)
    // Hand-checked against the fixture as well: 5 active (NEW, IN_PROGRESS,
    // 2 × WAITING, REOPENED), 2 waiting, and 2 resolved inside 30 days (the
    // Resolved one and the Closed one; the 40-day-old Closed one is outside).
    expect([expected.open, expected.waiting, expected.resolved]).toEqual([5, 2, 2])
  })

  it('30-day window: includes 00:00 +07 of day −29, excludes 1 ms before, and moves at Bangkok midnight', async () => {
    // 7 Sep 00:00 Bangkok, and 1 ms before it.
    await makeTicket(ids.boundary, 'CLOSED', { resolvedAt: new Date('2026-09-06T17:00:00.000Z') })
    await makeTicket(ids.boundary, 'CLOSED', { resolvedAt: new Date('2026-09-06T16:59:59.999Z') })

    vi.useFakeTimers({ toFake: ['Date'] })
    // 6 Oct 23:59:59.999 Bangkok: window starts 7 Sep.
    vi.setSystemTime(new Date('2026-10-06T16:59:59.999Z'))
    let res = await dashboard(cookies.boundary)
    expect(res.body.metrics.resolvedLast30Days).toEqual({
      value: 1,
      windowStart: '2026-09-07',
      drillDown: '/tickets?resolvedFrom=2026-09-07',
    })

    // 7 Oct 00:00 Bangkok: the window moves to 8 Sep, so neither counts.
    vi.setSystemTime(new Date('2026-10-06T17:00:00.000Z'))
    res = await dashboard(cookies.boundary)
    expect(res.body.metrics.resolvedLast30Days).toEqual({
      value: 0,
      windowStart: '2026-09-08',
      drillDown: '/tickets?resolvedFrom=2026-09-08',
    })
  })
})

describe('API-39 lists (BR-43, BR-44, AC-35)', () => {
  it('Recently Updated: 5 newest by updatedAt, ties by id descending, documented fields only', async () => {
    const res = await dashboard(cookies.a)
    const expected = await prisma.ticket.findMany({
      where: { requesterId: ids.a },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 5,
    })
    expect(res.body.recentlyUpdated).toHaveLength(5)
    expect(res.body.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual(
      expected.map((t) => t.id),
    )
    for (const item of res.body.recentlyUpdated) {
      expect(Object.keys(item).sort()).toEqual(
        ['currentStatus', 'id', 'summary', 'ticketNumber', 'updatedAt'].sort(),
      )
    }
    // The tied pair comes out higher id first.
    const order = res.body.recentlyUpdated.map((t: { id: number }) => t.id)
    expect(order.indexOf(Math.max(...tiedIds))).toBeLessThan(order.indexOf(Math.min(...tiedIds)))
  })

  it('Recently Resolved: non-null resolvedAt only, newest first; Reopened absent', async () => {
    const res = await dashboard(cookies.a)
    const statuses = res.body.recentlyResolved.map(
      (t: { currentStatus: string }) => t.currentStatus,
    )
    expect(statuses).toEqual(['RESOLVED', 'CLOSED', 'CLOSED'])
    const times = res.body.recentlyResolved.map((t: { resolvedAt: string }) =>
      Date.parse(t.resolvedAt),
    )
    expect(times).toEqual([...times].sort((x, y) => y - x))
    for (const item of res.body.recentlyResolved) {
      expect(Object.keys(item).sort()).toEqual(
        ['currentStatus', 'id', 'resolvedAt', 'summary', 'ticketNumber'].sort(),
      )
    }
  })

  it('caps both lists at 5 and never returns full Ticket objects', async () => {
    const res = await dashboard(cookies.a)
    expect(res.body.recentlyUpdated.length).toBeLessThanOrEqual(5)
    expect(res.body.recentlyResolved.length).toBeLessThanOrEqual(5)
    expect(JSON.stringify(res.body)).not.toContain('description')
  })
})

describe('API-40 zero data (BR-37, BR-40, AC-31)', () => {
  it('a Requester with no Tickets gets hasAnyTickets false, zeros, and empty lists', async () => {
    const res = await dashboard(cookies.empty)
    expect(res.status).toBe(200)
    expect(res.body.hasAnyTickets).toBe(false)
    expect(res.body.metrics.openTickets).toEqual({
      value: 0,
      drillDown: '/tickets?statusGroup=active',
    })
    expect(res.body.metrics.waitingForYou).toEqual({
      value: 0,
      drillDown: '/tickets?status=WAITING_FOR_REQUESTER',
    })
    expect(res.body.metrics.resolvedLast30Days.value).toBe(0)
    expect(res.body.recentlyUpdated).toEqual([])
    expect(res.body.recentlyResolved).toEqual([])
  })

  it('a Requester with Tickets but none waiting gets waitingForYou 0', async () => {
    const res = await dashboard(cookies.b)
    expect(res.body.hasAnyTickets).toBe(true)
    expect(res.body.metrics.waitingForYou.value).toBe(0)
  })
})

describe('API-41 drill-down equals list (BR-38, AC-30)', () => {
  it.each(['a', 'b', 'empty'] as const)(
    'every card for %s matches its list totalCount',
    async (who) => {
      const res = await dashboard(cookies[who])
      for (const metric of Object.values(res.body.metrics) as {
        value: number
        drillDown: string
      }[]) {
        const list = await followDrillDown(cookies[who], metric.drillDown)
        expect(list.status).toBe(200)
        expect(list.body.totalCount).toBe(metric.value)
      }
    },
  )
})

describe('API-42 My Tickets drill-down filters (api-spec.md §4.2)', () => {
  const list = (query: string) => request(app).get(`/api/tickets?${query}`).set('Cookie', cookies.a)

  it('statusGroup=active returns only active Tickets', async () => {
    const res = await list('statusGroup=active&pageSize=50')
    expect(res.body.totalCount).toBe(5)
    for (const t of res.body.data) expect(ACTIVE).toContain(t.currentStatus)
  })

  it('statusGroup combines with status (AND)', async () => {
    expect((await list('statusGroup=active&status=WAITING_FOR_REQUESTER')).body.totalCount).toBe(2)
    expect((await list('statusGroup=active&status=CLOSED')).body.totalCount).toBe(0)
  })

  it('resolvedFrom keeps Tickets resolved on or after 00:00 Bangkok of that date', async () => {
    const all = await prisma.ticket.findMany({
      where: { requesterId: ids.a, resolvedAt: { not: null } },
    })
    const cutoff = new Date(Date.now() - 20 * DAY)
    const date = new Date(cutoff.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    const start = Date.parse(date) - 7 * 3600 * 1000
    const res = await list(`resolvedFrom=${date}`)
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(all.filter((t) => t.resolvedAt!.getTime() >= start).length)
    expect(res.body.totalCount).toBe(2)
  })

  it('sortBy=updatedAt sorts by updatedAt then id', async () => {
    const res = await list('sortBy=updatedAt&sortDir=desc&pageSize=50')
    expect(res.status).toBe(200)
    const expected = await prisma.ticket.findMany({
      where: { requesterId: ids.a },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    })
    expect(res.body.data.map((t: { id: number }) => t.id)).toEqual(expected.map((t) => t.id))
  })

  it.each([
    ['statusGroup=all', 'statusGroup'],
    ['statusGroup=active&statusGroup=active', 'statusGroup'],
    ['resolvedFrom=2026-02-30', 'resolvedFrom'],
    ['resolvedFrom=06-10-2026', 'resolvedFrom'],
    ['sortBy=resolvedAt', 'sortBy'],
  ])('%s → 400 INVALID_FILTER on %s', async (query, field) => {
    const res = await list(query)
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual(expect.objectContaining({ code: 'INVALID_FILTER', field }))
  })

  it('leaves the default listing unchanged: all own Tickets, createdAt descending', async () => {
    const res = await list('pageSize=50')
    const expected = await prisma.ticket.findMany({
      where: { requesterId: ids.a },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    expect(res.body.totalCount).toBe(9)
    expect(res.body.data.map((t: { id: number }) => t.id)).toEqual(expected.map((t) => t.id))
  })
})
