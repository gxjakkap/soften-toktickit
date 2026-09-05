import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'

// API-06..12 (AC-03, AC-16, AC-17, AC-18, AC-19, AC-20; BR-14, BR-16, BR-17,
// BR-18, BR-19, BR-30) plus INVALID_FILTER/sort-by-column coverage that
// tests.md's table doesn't break into its own row but api-spec.md §5 and
// BR-18 require.

const TAG = 'my-tickets.test'

let requesterAId: number
let requesterBId: number
let requesterCId: number // owns zero tickets (API-11/AC-20)
let catXId: number
let catYId: number
let relatedSystemId: number

type Seed = {
  summary: string
  categoryId: () => number
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH'
  currentStatus: 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'RESOLVED' | 'CLOSED' | 'CANCELLED'
  createdAt: string
}

const ticketIds: Record<string, number> = {}

async function wipe() {
  await prisma.ticket.deleteMany({
    where: { requesterId: { in: [requesterAId, requesterBId, requesterCId].filter(Boolean) } },
  })
  await prisma.requesterUser.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
}

beforeAll(async () => {
  const requesterA = await prisma.requesterUser.create({
    data: { name: 'Requester A', email: `a.${TAG}`, isActive: true },
  })
  const requesterB = await prisma.requesterUser.create({
    data: { name: 'Requester B', email: `b.${TAG}`, isActive: true },
  })
  const requesterC = await prisma.requesterUser.create({
    data: { name: 'Requester C', email: `c.${TAG}`, isActive: true },
  })
  requesterAId = requesterA.id
  requesterBId = requesterB.id
  requesterCId = requesterC.id

  const catX = await prisma.category.create({ data: { name: `Category X ${TAG}` } })
  const catY = await prisma.category.create({ data: { name: `Category Y ${TAG}` } })
  catXId = catX.id
  catYId = catY.id

  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  relatedSystemId = relatedSystem.id

  const seeds: Record<string, Seed> = {
    T1: { summary: 'VPN connection drops constantly', categoryId: () => catXId, requestedPriority: 'HIGH', currentStatus: 'OPEN', createdAt: '2026-01-01T10:00:00.000Z' },
    T2: { summary: 'Printer not responding', categoryId: () => catYId, requestedPriority: 'LOW', currentStatus: 'NEW', createdAt: '2026-01-02T10:00:00.000Z' },
    T3: { summary: 'Laptop battery drains fast', categoryId: () => catXId, requestedPriority: 'MEDIUM', currentStatus: 'IN_PROGRESS', createdAt: '2026-01-03T10:00:00.000Z' },
    T4: { summary: 'Wifi intermittent vpn drops', categoryId: () => catYId, requestedPriority: 'HIGH', currentStatus: 'OPEN', createdAt: '2026-01-04T10:00:00.000Z' },
    T5: { summary: 'Email sync delayed', categoryId: () => catXId, requestedPriority: 'LOW', currentStatus: 'PENDING', createdAt: '2026-01-05T10:00:00.000Z' },
    T6: { summary: 'Account locked out', categoryId: () => catYId, requestedPriority: 'MEDIUM', currentStatus: 'RESOLVED', createdAt: '2026-01-06T10:00:00.000Z' },
    T7: { summary: 'Software crash on save', categoryId: () => catXId, requestedPriority: 'HIGH', currentStatus: 'CLOSED', createdAt: '2026-01-07T10:00:00.000Z' },
    T8: { summary: 'Network drop in building B', categoryId: () => catYId, requestedPriority: 'LOW', currentStatus: 'CANCELLED', createdAt: '2026-01-08T10:00:00.000Z' },
    T9: { summary: 'Monitor flickering', categoryId: () => catXId, requestedPriority: 'MEDIUM', currentStatus: 'NEW', createdAt: '2026-01-09T10:00:00.000Z' },
    T10: { summary: 'Keyboard keys sticking', categoryId: () => catYId, requestedPriority: 'HIGH', currentStatus: 'OPEN', createdAt: '2026-01-10T10:00:00.000Z' },
    T11: { summary: 'Slow laptop performance', categoryId: () => catXId, requestedPriority: 'LOW', currentStatus: 'NEW', createdAt: '2026-01-11T10:00:00.000Z' },
    T12: { summary: 'Password reset needed', categoryId: () => catYId, requestedPriority: 'MEDIUM', currentStatus: 'NEW', createdAt: '2026-01-11T10:00:00.000Z' }, // same createdAt as T11 (tie-break)
  }

  for (const [key, seed] of Object.entries(seeds)) {
    const created = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-TEST-${TAG}-${key}`,
        requesterId: requesterAId,
        categoryId: seed.categoryId(),
        relatedSystemId,
        summary: seed.summary,
        description: `${seed.summary} — fixture description long enough to pass validation minimums.`,
        requestedPriority: seed.requestedPriority,
        currentStatus: seed.currentStatus,
        createdAt: new Date(seed.createdAt),
      },
    })
    ticketIds[key] = created.id
  }

  // Requester B: one ticket, used only to prove isolation from Requester A's list.
  await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${TAG}-B1`,
      requesterId: requesterBId,
      categoryId: catXId,
      relatedSystemId,
      summary: 'Requester B ticket, must never appear in A list',
      description: 'Fixture description long enough to pass validation minimums.',
      requestedPriority: 'MEDIUM',
      currentStatus: 'NEW',
    },
  })
})

afterAll(wipe)

describe('GET /api/tickets', () => {
  it('API-06 (AC-03, BR-14): returns only the requesterId owner’s tickets, never another Requester’s', async () => {
    const res = await request(app).get('/api/tickets').query({ requesterId: requesterAId, pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(12)
    const summaries = res.body.data.map((t: { summary: string }) => t.summary)
    expect(summaries).not.toContain('Requester B ticket, must never appear in A list')
  })

  it('API-11 (AC-20, BR-30): a Requester with zero tickets gets data: [] and hasAnyTickets: false', async () => {
    const res = await request(app).get('/api/tickets').query({ requesterId: requesterCId })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.hasAnyTickets).toBe(false)
    expect(res.body.totalCount).toBe(0)
  })

  it('rejects an unknown/inactive requesterId with 400 INVALID_REQUESTER', async () => {
    const res = await request(app).get('/api/tickets').query({ requesterId: -999 })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUESTER')
  })

  it('API-07 (AC-16, BR-16): search matches ticketNumber or summary, case-insensitive, partial', async () => {
    const res = await request(app).get('/api/tickets').query({ requesterId: requesterAId, search: 'vpn' })

    expect(res.status).toBe(200)
    const summaries = res.body.data.map((t: { summary: string }) => t.summary).sort()
    expect(summaries).toEqual(['VPN connection drops constantly', 'Wifi intermittent vpn drops'])
  })

  it('API-08 (AC-17, BR-17): categoryId + status filters combine with AND logic', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .query({ requesterId: requesterAId, categoryId: catXId, status: 'OPEN' })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].summary).toBe('VPN connection drops constantly')
  })

  it('API-12 (AC-19, BR-30): filters matching nothing return data: [] with hasAnyTickets: true, totalCount: 0', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .query({ requesterId: requesterAId, search: 'no-such-ticket-summary-anywhere' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.hasAnyTickets).toBe(true)
    expect(res.body.totalCount).toBe(0)
  })

  it('API-09 (AC-18): pagination metadata is correct and page 1 shows only the default page size', async () => {
    const res = await request(app).get('/api/tickets').query({ requesterId: requesterAId })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(10)
    expect(res.body.page).toBe(1)
    expect(res.body.pageSize).toBe(10)
    expect(res.body.totalCount).toBe(12)
    expect(res.body.totalPages).toBe(2)
  })

  it('API-09: page 2 shows the remaining tickets', async () => {
    const res = await request(app).get('/api/tickets').query({ requesterId: requesterAId, page: 2 })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })

  it('API-10 (BR-19): out-of-range page/pageSize are clamped, not rejected', async () => {
    const zeroPage = await request(app).get('/api/tickets').query({ requesterId: requesterAId, page: 0 })
    expect(zeroPage.status).toBe(200)
    expect(zeroPage.body.page).toBe(1)

    const negativePage = await request(app).get('/api/tickets').query({ requesterId: requesterAId, page: -5 })
    expect(negativePage.status).toBe(200)
    expect(negativePage.body.page).toBe(1)

    const oversizedPageSize = await request(app)
      .get('/api/tickets')
      .query({ requesterId: requesterAId, pageSize: 1000 })
    expect(oversizedPageSize.status).toBe(200)
    expect(oversizedPageSize.body.pageSize).toBe(50)

    const zeroPageSize = await request(app).get('/api/tickets').query({ requesterId: requesterAId, pageSize: 0 })
    expect(zeroPageSize.status).toBe(200)
    expect(zeroPageSize.body.pageSize).toBe(1)
  })

  it('BR-18: sortBy=summary asc sorts alphabetically by Summary', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .query({ requesterId: requesterAId, sortBy: 'summary', sortDir: 'asc', pageSize: 50 })

    expect(res.status).toBe(200)
    const summaries = res.body.data.map((t: { summary: string }) => t.summary)
    expect(summaries).toEqual([...summaries].sort())
  })

  it('BR-18: default sort is createdAt desc, with id desc as a deterministic tie-break', async () => {
    const res = await request(app).get('/api/tickets').query({ requesterId: requesterAId, pageSize: 50 })

    expect(res.status).toBe(200)
    // T11 and T12 share the same createdAt; T12 was inserted after T11, so
    // its id is higher, and the tie-break must put it first under a desc sort.
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)
    const t11Index = numbers.indexOf(`TKT-TEST-${TAG}-T11`)
    const t12Index = numbers.indexOf(`TKT-TEST-${TAG}-T12`)
    expect(t12Index).toBeLessThan(t11Index)
  })

  it('rejects an unrecognized requestedPriority/status/sortBy/sortDir/non-numeric categoryId with 400 INVALID_FILTER', async () => {
    const cases = [
      { requestedPriority: 'URGENT' },
      { status: 'DELETED' },
      { sortBy: 'notAField' },
      { sortDir: 'sideways' },
      { categoryId: 'abc' },
    ]
    for (const invalid of cases) {
      const res = await request(app).get('/api/tickets').query({ requesterId: requesterAId, ...invalid })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_FILTER')
    }
  })
})
