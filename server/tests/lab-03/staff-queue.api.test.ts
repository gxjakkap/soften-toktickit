import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Issue #6, specification.md §5 (FR-12, BR-31, BR-32) and api-spec.md §4.1:
// the shared IT Staff Ticket Queue — search, filter, sort, pagination across
// every Ticket regardless of Requester or Owner (AC-22..26).

const TAG = 'lab3.staff-queue.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`

let staffAId: number
let staffBId: number
let requesterId: number
let catXId: number
let catYId: number
let relatedSystemId: number
let staffACookie: string
let staffBCookie: string
let requesterCookie: string

type Seed = {
  summary: string
  categoryId: () => number
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH'
  itPriority: 'LOW' | 'MEDIUM' | 'HIGH'
  currentStatus:
    | 'NEW'
    | 'OPEN'
    | 'IN_PROGRESS'
    | 'WAITING_FOR_REQUESTER'
    | 'RESOLVED'
    | 'CLOSED'
    | 'REOPENED'
    | 'CANCELLED'
  ownerId: () => number | null
  createdAt: string
}

const ticketIds: Record<string, number> = {}

async function wipe() {
  await prisma.ticket.deleteMany({ where: { requesterId } })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const staffA = await prisma.user.create({
    data: { passwordHash, role: 'IT_STAFF', name: 'Queue Staff A', email: email('staff-a') },
  })
  const staffB = await prisma.user.create({
    data: { passwordHash, role: 'IT_STAFF', name: 'Queue Staff B', email: email('staff-b') },
  })
  const requester = await prisma.user.create({
    data: { passwordHash, role: 'REQUESTER', name: 'Queue Requester', email: email('requester') },
  })
  staffAId = staffA.id
  staffBId = staffB.id
  requesterId = requester.id
  staffACookie = await loginCookie(app, email('staff-a'), PASSWORD)
  staffBCookie = await loginCookie(app, email('staff-b'), PASSWORD)
  requesterCookie = await loginCookie(app, email('requester'), PASSWORD)

  const catX = await prisma.category.create({ data: { name: `Category X ${TAG}` } })
  const catY = await prisma.category.create({ data: { name: `Category Y ${TAG}` } })
  catXId = catX.id
  catYId = catY.id

  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  relatedSystemId = relatedSystem.id

  const seeds: Record<string, Seed> = {
    T1: {
      summary: 'VPN connection drops constantly',
      categoryId: () => catXId,
      requestedPriority: 'HIGH',
      itPriority: 'HIGH',
      currentStatus: 'OPEN',
      ownerId: () => staffAId,
      createdAt: '2026-01-01T10:00:00.000Z',
    },
    T2: {
      summary: 'Printer not responding',
      categoryId: () => catYId,
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      currentStatus: 'NEW',
      ownerId: () => null,
      createdAt: '2026-01-02T10:00:00.000Z',
    },
    T3: {
      summary: 'Laptop battery drains fast',
      categoryId: () => catXId,
      requestedPriority: 'MEDIUM',
      itPriority: 'HIGH',
      currentStatus: 'IN_PROGRESS',
      ownerId: () => staffBId,
      createdAt: '2026-01-03T10:00:00.000Z',
    },
    T4: {
      summary: 'Wifi intermittent vpn drops',
      categoryId: () => catYId,
      requestedPriority: 'HIGH',
      itPriority: 'MEDIUM',
      currentStatus: 'OPEN',
      ownerId: () => null,
      createdAt: '2026-01-04T10:00:00.000Z',
    },
    T5: {
      summary: 'Email sync delayed',
      categoryId: () => catXId,
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      currentStatus: 'WAITING_FOR_REQUESTER',
      ownerId: () => staffAId,
      createdAt: '2026-01-05T10:00:00.000Z',
    },
    T6: {
      summary: 'Account locked out',
      categoryId: () => catYId,
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: 'RESOLVED',
      ownerId: () => staffBId,
      createdAt: '2026-01-06T10:00:00.000Z',
    },
    T7: {
      summary: 'Software crash on save',
      categoryId: () => catXId,
      requestedPriority: 'HIGH',
      itPriority: 'HIGH',
      currentStatus: 'CLOSED',
      ownerId: () => staffAId,
      createdAt: '2026-01-07T10:00:00.000Z',
    },
    T8: {
      summary: 'Network drop in building B',
      categoryId: () => catYId,
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      currentStatus: 'CANCELLED',
      ownerId: () => null,
      createdAt: '2026-01-08T10:00:00.000Z',
    },
    T9: {
      summary: 'Monitor flickering',
      categoryId: () => catXId,
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: 'NEW',
      ownerId: () => null,
      createdAt: '2026-01-09T10:00:00.000Z',
    },
    T10: {
      summary: 'Keyboard keys sticking',
      categoryId: () => catYId,
      requestedPriority: 'HIGH',
      itPriority: 'HIGH',
      currentStatus: 'OPEN',
      ownerId: () => staffBId,
      createdAt: '2026-01-10T10:00:00.000Z',
    },
    T11: {
      summary: 'Slow laptop performance',
      categoryId: () => catXId,
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      currentStatus: 'NEW',
      ownerId: () => null,
      createdAt: '2026-01-11T10:00:00.000Z',
    },
    T12: {
      summary: 'Password reset needed',
      categoryId: () => catYId,
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: 'NEW',
      ownerId: () => null,
      createdAt: '2026-01-11T10:00:00.000Z',
    }, // same createdAt as T11 (tie-break)
  }

  for (const [key, seed] of Object.entries(seeds)) {
    const created = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-TEST-${TAG}-${key}`,
        requesterId,
        categoryId: seed.categoryId(),
        relatedSystemId,
        summary: seed.summary,
        description: `${seed.summary} — fixture description long enough to pass validation minimums.`,
        requestedPriority: seed.requestedPriority,
        itPriority: seed.itPriority,
        currentStatus: seed.currentStatus,
        ownerId: seed.ownerId(),
        createdAt: new Date(seed.createdAt),
      },
    })
    ticketIds[key] = created.id
  }
})

afterAll(wipe)

describe('GET /api/staff/tickets', () => {
  it('401s with no session', async () => {
    const res = await request(app).get('/api/staff/tickets')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('403 FORBIDDEN for a Requester caller (AC-35)', async () => {
    const res = await request(app).get('/api/staff/tickets').set('Cookie', requesterCookie)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  // search scopes every count-sensitive assertion below to this suite's own
  // fixtures (every ticketNumber embeds TAG) — the Queue is genuinely
  // table-wide (BR-31), so an unscoped query also returns whatever else is
  // in the database.
  it('BR-31: returns Tickets across every Requester and Owner, not scoped to the caller', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ search: TAG, pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(12)
    const summaries = res.body.data.map((t: { summary: string }) => t.summary)
    expect(summaries).toContain('Laptop battery drains fast') // owned by staff B, not A
  })

  it('BR-31: a second IT Staff caller sees the identical shared Queue, including Tickets owned by the first', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffBCookie)
      .query({ search: TAG, pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(12)
    const summaries = res.body.data.map((t: { summary: string }) => t.summary)
    expect(summaries).toContain('VPN connection drops constantly') // owned by staff A, not B
  })

  it('response rows carry the api-spec.md §4.1 shape, including itPriority and ownerName', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ search: 'Laptop battery drains fast' })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      ticketNumber: `TKT-TEST-${TAG}-T3`,
      summary: 'Laptop battery drains fast',
      categoryName: `Category X ${TAG}`,
      requestedPriority: 'MEDIUM',
      itPriority: 'HIGH',
      currentStatus: 'IN_PROGRESS',
      ownerName: 'Queue Staff B',
    })
  })

  it('AC-22: search matches ticketNumber or summary, case-insensitive, partial', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ search: 'vpn', pageSize: 50 })

    expect(res.status).toBe(200)
    // Scoped to this suite's own fixtures in case another "vpn"-summary
    // Ticket exists elsewhere in the table.
    const mine = res.body.data
      .filter((t: { ticketNumber: string }) => t.ticketNumber.includes(TAG))
      .map((t: { summary: string }) => t.summary)
      .sort()
    expect(mine).toEqual(['VPN connection drops constantly', 'Wifi intermittent vpn drops'])
  })

  it('search by exact ticketNumber finds the Ticket', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ search: `TKT-TEST-${TAG}-T6` })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].summary).toBe('Account locked out')
  })

  it('filters in isolation: categoryId', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ categoryId: catXId, pageSize: 50 })

    expect(res.status).toBe(200)
    expect(
      res.body.data.every((t: { categoryName: string }) => t.categoryName === `Category X ${TAG}`),
    ).toBe(true)
  })

  it('filters in isolation: requestedPriority', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ requestedPriority: 'HIGH', search: TAG, pageSize: 50 })

    expect(res.status).toBe(200)
    expect(
      res.body.data.every((t: { requestedPriority: string }) => t.requestedPriority === 'HIGH'),
    ).toBe(true)
    expect(res.body.totalCount).toBe(4)
  })

  it('filters in isolation: itPriority (independent of requestedPriority)', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ itPriority: 'HIGH', pageSize: 50 })

    expect(res.status).toBe(200)
    // T3 has requestedPriority MEDIUM but itPriority HIGH — proves the two
    // priority filters are independent, not aliases of one column.
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)
    expect(numbers).toContain(`TKT-TEST-${TAG}-T3`)
  })

  it('filters in isolation: status', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ status: 'OPEN', search: TAG, pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.data.every((t: { currentStatus: string }) => t.currentStatus === 'OPEN')).toBe(
      true,
    )
    expect(res.body.totalCount).toBe(3)
  })

  it('filters in isolation: ownerId as a numeric id', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ ownerId: staffBId, pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(3)
  })

  it('filters in isolation: ownerId=unassigned', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ ownerId: 'unassigned', search: TAG, pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(6) // T2, T4, T8, T9, T11, T12
  })

  it('AC-23: category + status filters combine with AND logic', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ categoryId: catXId, status: 'OPEN' })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].summary).toBe('VPN connection drops constantly')
  })

  it('combined filters: itPriority + ownerId=unassigned', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ itPriority: 'LOW', ownerId: 'unassigned', search: TAG, pageSize: 50 })

    expect(res.status).toBe(200)
    // Unassigned (T2, T4, T8, T9, T11, T12) narrowed to itPriority LOW: T2, T8, T11.
    const summaries = res.body.data.map((t: { summary: string }) => t.summary).sort()
    expect(summaries).toEqual([
      'Network drop in building B',
      'Printer not responding',
      'Slow laptop performance',
    ])
  })

  it('AC-24: pagination metadata is correct and page 1 shows only the default page size', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ search: TAG })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(10)
    expect(res.body.page).toBe(1)
    expect(res.body.pageSize).toBe(10)
    expect(res.body.totalCount).toBe(12)
    expect(res.body.totalPages).toBe(2)
  })

  it('page 2 shows the remaining tickets', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ search: TAG, page: 2 })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })

  it('out-of-range page/pageSize are clamped, not rejected', async () => {
    const zeroPage = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ page: 0 })
    expect(zeroPage.status).toBe(200)
    expect(zeroPage.body.page).toBe(1)

    const oversizedPageSize = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ pageSize: 1000 })
    expect(oversizedPageSize.status).toBe(200)
    expect(oversizedPageSize.body.pageSize).toBe(50)
  })

  it('specification.md §12-8: default sort is createdAt asc (oldest first), with id asc as a deterministic tie-break', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ pageSize: 50 })

    expect(res.status).toBe(200)
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)
    expect(numbers[0]).toBe(`TKT-TEST-${TAG}-T1`)
    // T11 and T12 share createdAt; T11 was inserted first so has the lower
    // id, and the asc tie-break must put it first.
    const t11Index = numbers.indexOf(`TKT-TEST-${TAG}-T11`)
    const t12Index = numbers.indexOf(`TKT-TEST-${TAG}-T12`)
    expect(t11Index).toBeLessThan(t12Index)
  })

  it('every sortable field sorts in both directions', async () => {
    const fields = [
      'createdAt',
      'updatedAt',
      'ticketNumber',
      'requestedPriority',
      'itPriority',
      'currentStatus',
    ]
    for (const sortBy of fields) {
      for (const sortDir of ['asc', 'desc'] as const) {
        const res = await request(app)
          .get('/api/staff/tickets')
          .set('Cookie', staffACookie)
          .query({ sortBy, sortDir, search: TAG, pageSize: 50 })
        expect(res.status).toBe(200)
        expect(res.body.data).toHaveLength(12)
      }
    }
  })

  it('sortBy=ticketNumber desc orders by Ticket Number descending', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ sortBy: 'ticketNumber', sortDir: 'desc', pageSize: 50 })

    expect(res.status).toBe(200)
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)
    expect(numbers).toEqual([...numbers].sort().reverse())
  })

  it('AC-25/AC-26: filters matching nothing return data: [] with hasAnyTickets: true, totalCount: 0', async () => {
    const res = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', staffACookie)
      .query({ search: 'no-such-ticket-summary-anywhere' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.hasAnyTickets).toBe(true)
    expect(res.body.totalCount).toBe(0)
  })

  it('rejects unrecognized requestedPriority/itPriority/status/sortBy/sortDir/ownerId/categoryId with 400 INVALID_FILTER', async () => {
    const cases = [
      { requestedPriority: 'URGENT' },
      { itPriority: 'URGENT' },
      { status: 'DELETED' },
      { sortBy: 'summary' }, // not a Queue-sortable field (unlike My Tickets)
      { sortDir: 'sideways' },
      { ownerId: 'not-a-number' },
      { categoryId: 'abc' },
      { categoryId: -999 },
    ]
    for (const invalid of cases) {
      const res = await request(app)
        .get('/api/staff/tickets')
        .set('Cookie', staffACookie)
        .query(invalid)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_FILTER')
    }
  })
})
