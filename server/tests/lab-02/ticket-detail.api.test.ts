import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'

// API-13, API-14 (AC-03, AC-24; BR-14, BR-15).

const TAG = 'ticket-detail.test'

let requesterId: number
let otherRequesterId: number
let categoryId: number
let relatedSystemId: number
let ticketId: number

beforeAll(async () => {
  const requester = await prisma.requesterUser.create({
    data: { name: 'Ticket Detail Fixture', email: `owner.${TAG}`, isActive: true },
  })
  const other = await prisma.requesterUser.create({
    data: { name: 'Other Fixture', email: `other.${TAG}`, isActive: true },
  })
  requesterId = requester.id
  otherRequesterId = other.id

  const category = await prisma.category.create({ data: { name: `Category ${TAG}` } })
  categoryId = category.id
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  relatedSystemId = relatedSystem.id

  const created = await request(app).post('/api/tickets').send({
    requesterId,
    categoryId,
    relatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'Ticket detail fixture ticket',
    description: 'Ticket created to exercise the ticket detail endpoint tests.',
  })
  ticketId = created.body.id
})

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { ticket: { requesterId: { in: [requesterId, otherRequesterId] } } } })
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterId, otherRequesterId] } } })
  await prisma.requesterUser.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
})

describe('GET /api/tickets/:id', () => {
  it('API-13 (AC-24): returns 200 with full detail and attachments for the owning Requester', async () => {
    const res = await request(app).get(`/api/tickets/${ticketId}`).query({ requesterId })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: ticketId,
      summary: 'Ticket detail fixture ticket',
      requester: { id: requesterId, name: 'Ticket Detail Fixture' },
      category: { id: categoryId },
      relatedSystem: { id: relatedSystemId },
      currentStatus: 'NEW',
    })
    expect(Array.isArray(res.body.attachments)).toBe(true)
  })

  it('API-14 (AC-03): returns 404 NOT_FOUND for a Ticket owned by a different Requester', async () => {
    const res = await request(app).get(`/api/tickets/${ticketId}`).query({ requesterId: otherRequesterId })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 404 NOT_FOUND for a nonexistent Ticket id (BR-15: same response as not-owned)', async () => {
    const res = await request(app).get('/api/tickets/999999999').query({ requesterId })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 INVALID_REQUESTER when requesterId is missing', async () => {
    const res = await request(app).get(`/api/tickets/${ticketId}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUESTER')
  })

  it('includes soft-removed attachments as metadata, marked isRemoved', async () => {
    const buffer = Buffer.alloc(1024, 1)
    const uploadRes = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field('requesterId', String(requesterId))
      .attach('file', buffer, { filename: 'to-remove.png', contentType: 'image/png' })

    await prisma.attachment.update({
      where: { id: uploadRes.body.id },
      data: { isRemoved: true, removedAt: new Date() },
    })

    const res = await request(app).get(`/api/tickets/${ticketId}`).query({ requesterId })

    const attachment = res.body.attachments.find((a: { id: number }) => a.id === uploadRes.body.id)
    expect(attachment).toBeTruthy()
    expect(attachment.isRemoved).toBe(true)
  })
})
