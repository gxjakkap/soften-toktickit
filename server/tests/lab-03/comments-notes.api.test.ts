import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Issue #7, specification.md §5 (FR-18, FR-19, BR-04, BR-26..30, BR-40) and
// api-spec.md §4.7: IT Staff Public Comments and Internal Notes, and the
// visibility boundary that keeps Internal Notes away from Requesters
// (extends Issue #5's AC-04 coverage to the staff comment path).

const TAG = 'lab3.comments-notes.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`

let staffId: number
let requesterId: number
let categoryId: number
let relatedSystemId: number
let staffCookie: string
let requesterCookie: string
let adminCookie: string

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const [staff, requester] = await Promise.all([
    prisma.user.create({
      data: { name: 'Notes Staff', email: email('staff'), role: 'IT_STAFF', passwordHash },
    }),
    prisma.user.create({
      data: { name: 'Notes Requester', email: email('requester'), role: 'REQUESTER', passwordHash },
    }),
    prisma.user.create({
      data: { name: 'Notes Admin', email: email('admin'), role: 'ADMINISTRATOR', passwordHash },
    }),
  ])
  staffId = staff.id
  requesterId = requester.id

  staffCookie = await loginCookie(app, email('staff'), PASSWORD)
  requesterCookie = await loginCookie(app, email('requester'), PASSWORD)
  adminCookie = await loginCookie(app, email('admin'), PASSWORD)

  const category = await prisma.category.create({ data: { name: `Category ${TAG}` } })
  categoryId = category.id
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })
  relatedSystemId = relatedSystem.id
})

afterAll(async () => {
  await prisma.ticketComment.deleteMany({ where: { ticket: { requesterId } } })
  // Lab 4 BR-22: history rows (FK Restrict) go before their Tickets.
  await prisma.ticketStatusHistory.deleteMany({ where: { ticket: { requesterId } } })
  await prisma.ticket.deleteMany({ where: { requesterId } })
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
})

async function createOwnedTicket() {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${TAG}-${Date.now()}-${Math.random()}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: 'Fixture ticket for Issue #7 comments/notes',
      description: 'Fixture ticket description long enough to pass validation minimums.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      ownerId: staffId,
    },
  })
  return ticket.id
}

describe('POST /api/staff/tickets/:id/comments (FR-18, FR-19, BR-26..30)', () => {
  it('creates a PUBLIC comment with author/timestamp from the session', async () => {
    const ticketId = await createOwnedTicket()
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/comments`)
      .set('Cookie', staffCookie)
      .send({ visibility: 'PUBLIC', content: 'Escalated to hardware vendor.' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      ticketId,
      authorName: 'Notes Staff',
      authorRole: 'IT_STAFF',
      visibility: 'PUBLIC',
      content: 'Escalated to hardware vendor.',
    })

    const stored = await prisma.ticketComment.findUnique({ where: { id: res.body.id } })
    expect(stored?.authorId).toBe(staffId)
  })

  it('creates an INTERNAL note, visible only through the staff detail endpoint', async () => {
    const ticketId = await createOwnedTicket()
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/comments`)
      .set('Cookie', staffCookie)
      .send({ visibility: 'INTERNAL', content: 'Vendor RMA #4821 opened.' })

    expect(res.status).toBe(201)
    expect(res.body.visibility).toBe('INTERNAL')

    const staffDetail = await request(app)
      .get(`/api/staff/tickets/${ticketId}`)
      .set('Cookie', staffCookie)
    expect(
      staffDetail.body.comments.some(
        (c: { content: string }) => c.content === 'Vendor RMA #4821 opened.',
      ),
    ).toBe(true)

    // AC-04/BR-29 regression guard: the Requester's own detail endpoint must
    // never surface this Internal Note, even though the Requester owns the Ticket.
    const requesterDetail = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('Cookie', requesterCookie)
    expect(requesterDetail.status).toBe(200)
    expect(JSON.stringify(requesterDetail.body)).not.toContain('Vendor RMA #4821 opened.')
    expect(
      requesterDetail.body.comments.every(
        (c: { content: string }) => c.content !== 'Vendor RMA #4821 opened.',
      ),
    ).toBe(true)
  })

  it('400 VALIDATION_ERROR for an invalid visibility value', async () => {
    const ticketId = await createOwnedTicket()
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/comments`)
      .set('Cookie', staffCookie)
      .send({ visibility: 'SECRET', content: 'Should not save.' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.field).toBe('visibility')
  })

  it('AC-21/BR-26: rejects whitespace-only and over-length content', async () => {
    const ticketId = await createOwnedTicket()

    const whitespace = await request(app)
      .post(`/api/staff/tickets/${ticketId}/comments`)
      .set('Cookie', staffCookie)
      .send({ visibility: 'PUBLIC', content: '   ' })
    expect(whitespace.status).toBe(400)
    expect(whitespace.body.error.field).toBe('content')

    const tooLong = await request(app)
      .post(`/api/staff/tickets/${ticketId}/comments`)
      .set('Cookie', staffCookie)
      .send({ visibility: 'INTERNAL', content: 'a'.repeat(2001) })
    expect(tooLong.status).toBe(400)
    expect(tooLong.body.error.field).toBe('content')
  })

  it('404s for a nonexistent ticket', async () => {
    const res = await request(app)
      .post('/api/staff/tickets/999999999/comments')
      .set('Cookie', staffCookie)
      .send({ visibility: 'PUBLIC', content: 'No ticket to attach to.' })
    expect(res.status).toBe(404)
  })

  it('AC-04: a Requester calling this endpoint is rejected without exposing any note content', async () => {
    const ticketId = await createOwnedTicket()
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/comments`)
      .set('Cookie', requesterCookie)
      .send({ visibility: 'INTERNAL', content: 'Attempted internal note from a Requester.' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(JSON.stringify(res.body)).not.toContain('Attempted internal note from a Requester.')
  })

  // Lab 4 (docs/lab-04/tests.md §6): specification.md BR-29 supersedes
  // Lab 3 BR-40, so an Administrator now posts here like IT Staff.
  it('Lab 4 BR-29: an Administrator can post a comment and an internal note here', async () => {
    const ticketId = await createOwnedTicket()
    for (const visibility of ['PUBLIC', 'INTERNAL']) {
      const res = await request(app)
        .post(`/api/staff/tickets/${ticketId}/comments`)
        .set('Cookie', adminCookie)
        .send({ visibility, content: 'Admin posting.' })
      expect(res.status).toBe(201)
      expect(res.body.visibility).toBe(visibility)
    }
  })
})
