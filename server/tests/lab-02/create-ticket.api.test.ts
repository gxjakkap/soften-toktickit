import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'

// API-01..05 (AC-01, AC-04, AC-05, AC-06; BR-01, BR-02, BR-07, BR-08, BR-12,
// BR-20, BR-21) plus the api-spec.md §4 INVALID_REFERENCE cases for an
// invalid/inactive Category or Related System.

const TAG = 'create-ticket.test.invalid'

let activeRequesterId: number
let inactiveRequesterId: number
let activeCategoryId: number
let inactiveCategoryId: number
let activeRelatedSystemId: number
let inactiveRelatedSystemId: number

async function wipe() {
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [activeRequesterId, inactiveRequesterId].filter(Boolean) } } })
  await prisma.requesterUser.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    requesterId: activeRequesterId,
    categoryId: activeCategoryId,
    relatedSystemId: activeRelatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'Laptop battery drains quickly',
    description: 'My laptop battery drains much faster than usual even when idle.',
    ...overrides,
  }
}

beforeAll(async () => {
  const activeRequester = await prisma.requesterUser.create({
    data: { name: 'Active Fixture', email: `active.${TAG}`, isActive: true },
  })
  const inactiveRequester = await prisma.requesterUser.create({
    data: { name: 'Inactive Fixture', email: `inactive.${TAG}`, isActive: false },
  })
  activeRequesterId = activeRequester.id
  inactiveRequesterId = inactiveRequester.id

  const activeCategory = await prisma.category.create({ data: { name: `Category Active ${TAG}` } })
  const inactiveCategory = await prisma.category.create({
    data: { name: `Category Inactive ${TAG}`, isActive: false },
  })
  activeCategoryId = activeCategory.id
  inactiveCategoryId = inactiveCategory.id

  const activeRelatedSystem = await prisma.relatedSystem.create({ data: { name: `System Active ${TAG}` } })
  const inactiveRelatedSystem = await prisma.relatedSystem.create({
    data: { name: `System Inactive ${TAG}`, isActive: false },
  })
  activeRelatedSystemId = activeRelatedSystem.id
  inactiveRelatedSystemId = inactiveRelatedSystem.id
})

afterAll(wipe)

async function ticketCountForRequester() {
  return prisma.ticket.count({ where: { requesterId: activeRequesterId } })
}

describe('POST /api/tickets', () => {
  it('API-01 (AC-01, BR-01, BR-02): creates a Ticket and returns 201 with a unique Ticket Number', async () => {
    const res = await request(app).post('/api/tickets').send(validBody())

    expect(res.status).toBe(201)
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)
    expect(res.body.currentStatus).toBe('NEW')
    expect(res.body.requesterId).toBe(activeRequesterId)
    expect(res.body.categoryId).toBe(activeCategoryId)
    expect(res.body.relatedSystemId).toBe(activeRelatedSystemId)

    const second = await request(app).post('/api/tickets').send(validBody())
    expect(second.status).toBe(201)
    expect(second.body.ticketNumber).not.toBe(res.body.ticketNumber)

    const stored = await prisma.ticket.findUnique({ where: { id: res.body.id } })
    expect(stored?.ticketNumber).toBe(res.body.ticketNumber)
  })

  it('API-02 (AC-04, BR-20): rejects a missing Summary with a field-level error and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app).post('/api/tickets').send(validBody({ summary: '' }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('summary')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('API-03 (AC-05, BR-21): rejects a Description under 10 characters and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app).post('/api/tickets').send(validBody({ description: 'too short' }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('description')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('API-04 (AC-06, BR-08): rejects a missing Requested Priority and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app).post('/api/tickets').send(validBody({ requestedPriority: undefined }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('requestedPriority')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('API-05 (BR-12): rejects an inactive requesterId and inserts nothing', async () => {
    const before = await prisma.ticket.count({ where: { categoryId: activeCategoryId } })

    const res = await request(app).post('/api/tickets').send(validBody({ requesterId: inactiveRequesterId }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUESTER')
    expect(await prisma.ticket.count({ where: { categoryId: activeCategoryId } })).toBe(before)
  })

  it('API-05 (BR-12): rejects an unknown requesterId and inserts nothing', async () => {
    const before = await prisma.ticket.count({ where: { categoryId: activeCategoryId } })

    const res = await request(app).post('/api/tickets').send(validBody({ requesterId: -999 }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUESTER')
    expect(await prisma.ticket.count({ where: { categoryId: activeCategoryId } })).toBe(before)
  })

  it('rejects an inactive Category with INVALID_REFERENCE and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app).post('/api/tickets').send(validBody({ categoryId: inactiveCategoryId }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(res.body.error.field).toBe('categoryId')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('rejects an unknown Category with INVALID_REFERENCE and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app).post('/api/tickets').send(validBody({ categoryId: -999 }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('rejects an inactive Related System with INVALID_REFERENCE and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .send(validBody({ relatedSystemId: inactiveRelatedSystemId }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(res.body.error.field).toBe('relatedSystemId')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('rejects an unknown Related System with INVALID_REFERENCE and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app).post('/api/tickets').send(validBody({ relatedSystemId: -999 }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(await ticketCountForRequester()).toBe(before)
  })
})
