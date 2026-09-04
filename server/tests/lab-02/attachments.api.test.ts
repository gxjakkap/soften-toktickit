import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'

// API-15..18, API-22, API-23 (AC-09..13; BR-24..26, BR-29).

const TAG = 'attachments.test.invalid'

let requesterId: number
let otherRequesterId: number
let categoryId: number
let relatedSystemId: number
let ticketId: number

async function createTicket() {
  const created = await request(app).post('/api/tickets').send({
    requesterId,
    categoryId,
    relatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'Attachment fixture ticket',
    description: 'Ticket created to exercise attachment upload endpoint tests.',
  })
  return created.body.id as number
}

beforeAll(async () => {
  const requester = await prisma.requesterUser.create({
    data: { name: 'Attachment Fixture', email: `owner.${TAG}`, isActive: true },
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
})

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { ticket: { requesterId: { in: [requesterId, otherRequesterId] } } } })
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterId, otherRequesterId] } } })
  await prisma.requesterUser.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
})

describe('POST /api/tickets/:id/attachments', () => {
  it('API-15 (AC-09): accepts a valid 2MB jpg and returns 201 in the active attachment list', async () => {
    ticketId = await createTicket()
    const buffer = Buffer.alloc(2 * 1024 * 1024, 1)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field('requesterId', String(requesterId))
      .attach('file', buffer, { filename: 'receipt.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(201)
    expect(res.body.originalFileName).toBe('receipt.jpg')
    expect(res.body.isRemoved).toBe(false)

    const stored = await prisma.attachment.findUnique({ where: { id: res.body.id } })
    expect(stored?.isRemoved).toBe(false)
  })

  it('API-16 (AC-10): rejects a 6th upload once 5 active attachments exist', async () => {
    const localTicketId = await createTicket()
    const smallFile = () => Buffer.alloc(1024, 1)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`/api/tickets/${localTicketId}/attachments`)
        .field('requesterId', String(requesterId))
        .attach('file', smallFile(), { filename: `file-${i}.png`, contentType: 'image/png' })
      expect(res.status).toBe(201)
    }

    const before = await prisma.attachment.count({ where: { ticketId: localTicketId } })
    const res = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .field('requesterId', String(requesterId))
      .attach('file', smallFile(), { filename: 'file-6.png', contentType: 'image/png' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ATTACHMENT_LIMIT_REACHED')
    expect(await prisma.attachment.count({ where: { ticketId: localTicketId } })).toBe(before)
  })

  it('API-17 (AC-11): rejects a file over 5MB with 413 and inserts nothing', async () => {
    const localTicketId = await createTicket()
    const buffer = Buffer.alloc(6 * 1024 * 1024, 1)

    const res = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .field('requesterId', String(requesterId))
      .attach('file', buffer, { filename: 'big.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('FILE_TOO_LARGE')
    expect(await prisma.attachment.count({ where: { ticketId: localTicketId } })).toBe(0)
  })

  it('API-18 (AC-12): rejects an unsupported file type with 415 and inserts nothing', async () => {
    const localTicketId = await createTicket()

    const res = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .field('requesterId', String(requesterId))
      .attach('file', Buffer.from('not an executable, just bytes'), {
        filename: 'virus.exe',
        contentType: 'application/x-msdownload',
      })

    expect(res.status).toBe(415)
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(await prisma.attachment.count({ where: { ticketId: localTicketId } })).toBe(0)
  })

  it('API-22 (BR-29): rejects upload to a Ticket not owned by the caller with 404', async () => {
    const localTicketId = await createTicket()

    const res = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .field('requesterId', String(otherRequesterId))
      .attach('file', Buffer.from('hello'), { filename: 'note.png', contentType: 'image/png' })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('API-23 (AC-13): a rejected upload does not affect the parent Ticket', async () => {
    const localTicketId = await createTicket()

    const res = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .field('requesterId', String(requesterId))
      .attach('file', Buffer.from('bad'), { filename: 'virus.exe', contentType: 'application/x-msdownload' })

    expect(res.status).toBe(415)

    const ticket = await prisma.ticket.findUnique({ where: { id: localTicketId } })
    expect(ticket).not.toBeNull()
    expect(ticket?.summary).toBe('Attachment fixture ticket')
  })
})
