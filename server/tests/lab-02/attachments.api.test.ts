import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// API-15..18, API-22, API-23 (AC-09..13; BR-24..26, BR-29).
//
// Lab 3 (BR-03, BR-16): ownership comes from the session, not a
// client-supplied requesterId.

const TAG = 'attachments.test.invalid'
const PASSWORD = 'DevPass123!'

let requesterId: number
let otherRequesterId: number
let categoryId: number
let relatedSystemId: number
let ticketId: number
let cookie: string
let otherCookie: string

async function createTicket() {
  const created = await request(app).post('/api/tickets').set('Cookie', cookie).send({
    categoryId,
    relatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'Attachment fixture ticket',
    description: 'Ticket created to exercise attachment upload endpoint tests.',
  })
  return created.body.id as number
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const requester = await prisma.user.create({
    data: { passwordHash, role: 'REQUESTER', name: 'Attachment Fixture', email: `owner.${TAG}` },
  })
  const other = await prisma.user.create({
    data: { passwordHash, role: 'REQUESTER', name: 'Other Fixture', email: `other.${TAG}` },
  })
  requesterId = requester.id
  otherRequesterId = other.id
  cookie = await loginCookie(app, `owner.${TAG}`, PASSWORD)
  otherCookie = await loginCookie(app, `other.${TAG}`, PASSWORD)

  const category = await prisma.category.create({ data: { name: `Category ${TAG}` } })
  categoryId = category.id
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  relatedSystemId = relatedSystem.id
})

afterAll(async () => {
  await prisma.attachment.deleteMany({
    where: { ticket: { requesterId: { in: [requesterId, otherRequesterId] } } },
  })
  await prisma.ticket.deleteMany({
    where: { requesterId: { in: [requesterId, otherRequesterId] } },
  })
  await prisma.user.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
})

describe('POST /api/tickets/:id/attachments', () => {
  it('API-15 (AC-09): accepts a valid 2MB jpg and returns 201 in the active attachment list', async () => {
    ticketId = await createTicket()
    const buffer = Buffer.alloc(2 * 1024 * 1024, 1)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('Cookie', cookie)
      .attach('file', buffer, { filename: 'receipt.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(201)
    expect(res.body.originalFileName).toBe('receipt.jpg')
    expect(res.body.isRemoved).toBe(false)
    // api-spec.md §7's 201 shape never includes storedFileName (on-disk name)
    // or removedReason (only meaningful once removed).
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'id',
        'isRemoved',
        'mimeType',
        'originalFileName',
        'sizeBytes',
        'ticketId',
        'uploadedAt',
      ].sort(),
    )

    const stored = await prisma.attachment.findUnique({ where: { id: res.body.id } })
    expect(stored?.isRemoved).toBe(false)
  })

  it('API-16 (AC-10): rejects a 6th upload once 5 active attachments exist', async () => {
    const localTicketId = await createTicket()
    const smallFile = () => Buffer.alloc(1024, 1)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`/api/tickets/${localTicketId}/attachments`)
        .set('Cookie', cookie)
        .attach('file', smallFile(), { filename: `file-${i}.png`, contentType: 'image/png' })
      expect(res.status).toBe(201)
    }

    const before = await prisma.attachment.count({ where: { ticketId: localTicketId } })
    const res = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .set('Cookie', cookie)
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
      .set('Cookie', cookie)
      .attach('file', buffer, { filename: 'big.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('FILE_TOO_LARGE')
    expect(await prisma.attachment.count({ where: { ticketId: localTicketId } })).toBe(0)
  })

  it('API-18 (AC-12): rejects an unsupported file type with 415 and inserts nothing', async () => {
    const localTicketId = await createTicket()

    const res = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .set('Cookie', cookie)
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
      .set('Cookie', otherCookie)
      .attach('file', Buffer.from('hello'), { filename: 'note.png', contentType: 'image/png' })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('API-23 (AC-13): a rejected upload does not affect the parent Ticket', async () => {
    const localTicketId = await createTicket()

    const res = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .set('Cookie', cookie)
      .attach('file', Buffer.from('bad'), {
        filename: 'virus.exe',
        contentType: 'application/x-msdownload',
      })

    expect(res.status).toBe(415)

    const ticket = await prisma.ticket.findUnique({ where: { id: localTicketId } })
    expect(ticket).not.toBeNull()
    expect(ticket?.summary).toBe('Attachment fixture ticket')
  })
})

async function uploadAttachment(localTicketId: number, filename = 'download-me.png') {
  const res = await request(app)
    .post(`/api/tickets/${localTicketId}/attachments`)
    .set('Cookie', cookie)
    .attach('file', Buffer.from('file bytes for download tests'), {
      filename,
      contentType: 'image/png',
    })
  return res.body as { id: number }
}

describe('GET /api/attachments/:id/download', () => {
  it('API-19 (FR-11): streams an active attachment byte-identical to the upload with correct headers', async () => {
    const localTicketId = await createTicket()
    const content = Buffer.from('file bytes for download tests')
    const uploadRes = await request(app)
      .post(`/api/tickets/${localTicketId}/attachments`)
      .set('Cookie', cookie)
      .attach('file', content, { filename: 'download-me.png', contentType: 'image/png' })

    const res = await request(app)
      .get(`/api/attachments/${uploadRes.body.id}/download`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['content-disposition']).toContain('download-me.png')
    expect(Buffer.compare(res.body as Buffer, content)).toBe(0)
  })

  it('API-20 (AC-15): returns 410 ATTACHMENT_REMOVED for a removed attachment, no file returned', async () => {
    const localTicketId = await createTicket()
    const attachment = await uploadAttachment(localTicketId)
    await request(app)
      .patch(`/api/attachments/${attachment.id}/remove`)
      .set('Cookie', cookie)
      .send()

    const res = await request(app)
      .get(`/api/attachments/${attachment.id}/download`)
      .set('Cookie', cookie)

    expect(res.status).toBe(410)
    expect(res.body.error.code).toBe('ATTACHMENT_REMOVED')
  })

  it('returns 404 NOT_FOUND when the attachment is not owned by the caller', async () => {
    const localTicketId = await createTicket()
    const attachment = await uploadAttachment(localTicketId)

    const res = await request(app)
      .get(`/api/attachments/${attachment.id}/download`)
      .set('Cookie', otherCookie)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 401 UNAUTHENTICATED with no session', async () => {
    const localTicketId = await createTicket()
    const attachment = await uploadAttachment(localTicketId)

    const res = await request(app).get(`/api/attachments/${attachment.id}/download`)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('PATCH /api/attachments/:id/remove', () => {
  it('API-21 (AC-14): soft-removes an owned attachment, setting isRemoved/removedAt and keeping the row', async () => {
    const localTicketId = await createTicket()
    const attachment = await uploadAttachment(localTicketId)

    const res = await request(app)
      .patch(`/api/attachments/${attachment.id}/remove`)
      .set('Cookie', cookie)
      .send({ reason: 'Wrong file, re-uploading the correct one' })

    expect(res.status).toBe(200)
    expect(res.body.isRemoved).toBe(true)
    expect(res.body.removedAt).toBeTruthy()
    expect(res.body.removedReason).toBe('Wrong file, re-uploading the correct one')

    const stored = await prisma.attachment.findUnique({ where: { id: attachment.id } })
    expect(stored?.isRemoved).toBe(true)
  })

  it('omits removedReason as null when no reason is given', async () => {
    const localTicketId = await createTicket()
    const attachment = await uploadAttachment(localTicketId)

    const res = await request(app)
      .patch(`/api/attachments/${attachment.id}/remove`)
      .set('Cookie', cookie)
      .send()

    expect(res.status).toBe(200)
    expect(res.body.removedReason).toBeNull()
  })

  it('is idempotent: removing an already-removed attachment returns 200 with the existing removed state', async () => {
    const localTicketId = await createTicket()
    const attachment = await uploadAttachment(localTicketId)
    await request(app)
      .patch(`/api/attachments/${attachment.id}/remove`)
      .set('Cookie', cookie)
      .send({ reason: 'first' })

    const res = await request(app)
      .patch(`/api/attachments/${attachment.id}/remove`)
      .set('Cookie', cookie)
      .send()

    expect(res.status).toBe(200)
    expect(res.body.isRemoved).toBe(true)
    expect(res.body.removedReason).toBe('first')
  })

  it('rejects removal of an attachment not owned by the caller with 404', async () => {
    const localTicketId = await createTicket()
    const attachment = await uploadAttachment(localTicketId)

    const res = await request(app)
      .patch(`/api/attachments/${attachment.id}/remove`)
      .set('Cookie', otherCookie)
      .send()

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')

    const stored = await prisma.attachment.findUnique({ where: { id: attachment.id } })
    expect(stored?.isRemoved).toBe(false)
  })

  it('returns 401 UNAUTHENTICATED with no session', async () => {
    const localTicketId = await createTicket()
    const attachment = await uploadAttachment(localTicketId)

    const res = await request(app).patch(`/api/attachments/${attachment.id}/remove`).send({})

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})
