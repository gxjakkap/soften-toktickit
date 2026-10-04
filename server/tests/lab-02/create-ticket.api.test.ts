import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// API-01..05 (AC-01, AC-04, AC-05, AC-06; BR-01, BR-02, BR-07, BR-08, BR-12,
// BR-20, BR-21) plus the api-spec.md §4 INVALID_REFERENCE cases for an
// invalid/inactive Category or Related System.
//
// Lab 3 (BR-03, BR-16): the Requester now comes from the session, not a
// client-supplied requesterId, so every request here authenticates first.
// API-05's old "inactive/unknown requesterId" cases no longer apply as
// written — an inactive account cannot obtain a session at all (covered by
// auth.api.test.ts's INACTIVE_ACCOUNT case) — and are replaced below by the
// AC-03 case proving a spoofed requesterId in the body is ignored.

const TAG = 'create-ticket.test.invalid'
const PASSWORD = 'DevPass123!'

let activeRequesterId: number
let otherRequesterId: number
let activeCategoryId: number
let inactiveCategoryId: number
let activeRelatedSystemId: number
let inactiveRelatedSystemId: number
let cookie: string

async function wipe() {
  await prisma.ticket.deleteMany({
    where: { requesterId: { in: [activeRequesterId, otherRequesterId].filter(Boolean) } },
  })
  await prisma.user.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: activeCategoryId,
    relatedSystemId: activeRelatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'Laptop battery drains quickly',
    description: 'My laptop battery drains much faster than usual even when idle.',
    ...overrides,
  }
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const activeRequester = await prisma.user.create({
    data: { passwordHash, role: 'REQUESTER', name: 'Active Fixture', email: `active.${TAG}` },
  })
  const otherRequester = await prisma.user.create({
    data: { passwordHash, role: 'REQUESTER', name: 'Other Fixture', email: `other.${TAG}` },
  })
  activeRequesterId = activeRequester.id
  otherRequesterId = otherRequester.id
  cookie = await loginCookie(app, `active.${TAG}`, PASSWORD)

  const activeCategory = await prisma.category.create({ data: { name: `Category Active ${TAG}` } })
  const inactiveCategory = await prisma.category.create({
    data: { name: `Category Inactive ${TAG}`, isActive: false },
  })
  activeCategoryId = activeCategory.id
  inactiveCategoryId = inactiveCategory.id

  const activeRelatedSystem = await prisma.relatedSystem.create({
    data: { name: `System Active ${TAG}` },
  })
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
    const res = await request(app).post('/api/tickets').set('Cookie', cookie).send(validBody())

    expect(res.status).toBe(201)
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)
    expect(res.body.currentStatus).toBe('NEW')
    expect(res.body.requesterId).toBe(activeRequesterId)
    expect(res.body.categoryId).toBe(activeCategoryId)
    expect(res.body.relatedSystemId).toBe(activeRelatedSystemId)

    const second = await request(app).post('/api/tickets').set('Cookie', cookie).send(validBody())
    expect(second.status).toBe(201)
    expect(second.body.ticketNumber).not.toBe(res.body.ticketNumber)

    const stored = await prisma.ticket.findUnique({ where: { id: res.body.id } })
    expect(stored?.ticketNumber).toBe(res.body.ticketNumber)
  })

  it('API-02 (AC-04, BR-20): rejects a missing Summary with a field-level error and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(validBody({ summary: '' }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('summary')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('API-03 (AC-05, BR-21): rejects a Description under 10 characters and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(validBody({ description: 'too short' }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('description')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('API-04 (AC-06, BR-08): rejects a missing Requested Priority and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(validBody({ requestedPriority: undefined }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('requestedPriority')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('API-05 (AC-03, BR-03, BR-12): ignores a client-supplied requesterId and files the Ticket under the session owner', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(validBody({ requesterId: otherRequesterId }))

    expect(res.status).toBe(201)
    expect(res.body.requesterId).toBe(activeRequesterId)
    expect(await ticketCountForRequester()).toBe(before + 1)
  })

  it('401s with no session', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app).post('/api/tickets').send(validBody())

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('rejects an inactive Category with INVALID_REFERENCE and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(validBody({ categoryId: inactiveCategoryId }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(res.body.error.field).toBe('categoryId')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('rejects an unknown Category with INVALID_REFERENCE and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(validBody({ categoryId: -999 }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('rejects an inactive Related System with INVALID_REFERENCE and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(validBody({ relatedSystemId: inactiveRelatedSystemId }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(res.body.error.field).toBe('relatedSystemId')
    expect(await ticketCountForRequester()).toBe(before)
  })

  it('rejects an unknown Related System with INVALID_REFERENCE and inserts nothing', async () => {
    const before = await ticketCountForRequester()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(validBody({ relatedSystemId: -999 }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(await ticketCountForRequester()).toBe(before)
  })
})
