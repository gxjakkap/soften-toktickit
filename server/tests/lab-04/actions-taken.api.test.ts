// API-01..API-19 (tests.md §2.2); AC-01, AC-03..AC-15.
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import type { ActionStatus, TicketStatus } from '../../src/generated/prisma/client.js'
import { loginCookie } from '../helpers/auth.js'

// Issue #63, Lab 4 specification.md §5.1 (BR-01..BR-14, BR-25..BR-27) and
// api-spec.md §2: the Actions Taken API. Users come from the seed (Issue #62);
// every Ticket is a fixture created under TAG, so the seeded Tickets and
// their Actions are never touched.

const TAG = 'lab4.actions-taken.test.invalid'
const MISSING_ID = 2_000_000_000

const SEED = {
  sarah: 'sarah.johnson@example.com', // IT Staff
  ahmed: 'ahmed.hassan@example.com', // IT Staff
  alex: 'alex.morgan@example.com', // Administrator
  linda: 'linda.park@example.com', // inactive IT Staff
  jennifer: 'jennifer.anderson@example.com', // Requester
  michael: 'michael.brown@example.com', // Requester
  siriporn: 'siriporn.wattana@example.com', // Requester, mustChangePassword
}

const ids = {} as Record<keyof typeof SEED, number>
let sarah: string
let ahmed: string
let alex: string
let jennifer: string
let michael: string
let siriporn: string
let categoryId: number
let relatedSystemId: number
let ticketSeq = 0

beforeAll(async () => {
  for (const [key, email] of Object.entries(SEED)) {
    ids[key as keyof typeof SEED] = (await prisma.user.findUniqueOrThrow({ where: { email } })).id
  }
  ;[sarah, ahmed, alex, jennifer, michael, siriporn] = await Promise.all(
    [SEED.sarah, SEED.ahmed, SEED.alex, SEED.jennifer, SEED.michael, SEED.siriporn].map((e) =>
      loginCookie(app, e),
    ),
  )
  categoryId = (await prisma.category.create({ data: { name: `Category ${TAG}` } })).id
  relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })).id
})

afterAll(async () => {
  const fixtures = { ticket: { ticketNumber: { startsWith: TAG } } }
  await prisma.actionTaken.deleteMany({ where: fixtures })
  await prisma.ticketComment.deleteMany({ where: fixtures })
  await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: TAG } } })
  await prisma.category.deleteMany({ where: { name: { endsWith: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { endsWith: TAG } } })
})

async function makeTicket(
  opts: { requesterId?: number; ownerId?: number; status?: TicketStatus; createdAt?: Date } = {},
) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `${TAG}-${++ticketSeq}-${randomUUID()}`,
      requesterId: opts.requesterId ?? ids.jennifer,
      ownerId: opts.ownerId ?? ids.sarah,
      categoryId,
      relatedSystemId,
      summary: 'Actions Taken fixture',
      description: 'Fixture ticket for the Actions Taken API tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: opts.status ?? 'IN_PROGRESS',
      createdAt: opts.createdAt ?? new Date('2026-01-01T10:00:30.000Z'),
    },
  })
  return ticket.id
}

// Inserts an Action directly, for states the API can't reach in one call.
async function seedAction(
  ticketId: number,
  data: {
    status?: ActionStatus
    actionAt?: Date
    assignedToId?: number
    result?: string
    followUpRequired?: boolean
    followUpNote?: string
    description?: string
  } = {},
) {
  return prisma.actionTaken.create({
    data: {
      ticketId,
      performedById: ids.sarah,
      assignedToId: data.assignedToId ?? ids.sarah,
      actionAt: data.actionAt ?? new Date('2026-02-01T09:00:00.000Z'),
      description: data.description ?? 'Seeded fixture action.',
      result: data.result ?? (data.status === 'DONE' ? 'Fixed.' : null),
      status: data.status ?? 'PLANNED',
      followUpRequired: data.followUpRequired ?? false,
      followUpNote: data.followUpNote ?? null,
    },
  })
}

const valid = () => ({
  actionAt: new Date().toISOString(),
  description: 'Reseated the network cable and tested the link.',
})

const create = (ticketId: number, body: object, cookie = sarah) =>
  request(app).post(`/api/staff/tickets/${ticketId}/actions`).set('Cookie', cookie).send(body)

const update = (ticketId: number, actionId: number, body: object, cookie = sarah) =>
  request(app)
    .patch(`/api/staff/tickets/${ticketId}/actions/${actionId}`)
    .set('Cookie', cookie)
    .send(body)

const countActions = (ticketId: number) => prisma.actionTaken.count({ where: { ticketId } })

describe('API-01: guards on the staff Action endpoints (AC-06, BR-12)', () => {
  it('returns 401 without a session', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId)
    const responses = await Promise.all([
      request(app).get(`/api/staff/tickets/${ticketId}/actions`),
      request(app).post(`/api/staff/tickets/${ticketId}/actions`).send(valid()),
      request(app)
        .patch(`/api/staff/tickets/${ticketId}/actions/${action.id}`)
        .send({ version: 1, description: 'x' }),
      request(app).get(`/api/tickets/${ticketId}/actions`),
    ])
    for (const res of responses) {
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('returns 403 to a Requester on list, create, and update, even on their own Ticket', async () => {
    const ticketId = await makeTicket({ requesterId: ids.jennifer })
    const action = await seedAction(ticketId)
    const list = await request(app)
      .get(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', jennifer)
    const created = await create(ticketId, valid(), jennifer)
    const updated = await update(
      ticketId,
      action.id,
      { version: 1, description: 'Hijack' },
      jennifer,
    )
    for (const res of [list, created, updated]) {
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    }
    expect(await countActions(ticketId)).toBe(1)
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })).version).toBe(
      1,
    )
  })

  it('keeps a user who owes a password change blocked', async () => {
    const ticketId = await makeTicket({ requesterId: ids.siriporn })
    const res = await request(app).get(`/api/tickets/${ticketId}/actions`).set('Cookie', siriporn)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED')
  })
})

describe('API-02: GET /api/staff/tickets/:id/actions ordering (FR-02, BR-13, AC-15)', () => {
  it('orders by actionAt then id, includes Cancelled, and is stable across calls', async () => {
    const ticketId = await makeTicket()
    const tie = new Date('2026-03-01T08:00:00.000Z')
    const late = await seedAction(ticketId, { actionAt: new Date('2026-03-02T08:00:00.000Z') })
    const tieA = await seedAction(ticketId, { actionAt: tie, status: 'CANCELLED' })
    const early = await seedAction(ticketId, { actionAt: new Date('2026-02-01T08:00:00.000Z') })
    const tieB = await seedAction(ticketId, { actionAt: tie })

    const first = await request(app)
      .get(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', sarah)
    const second = await request(app)
      .get(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', alex)
    expect(first.status).toBe(200)
    expect(first.body.data.map((a: { id: number }) => a.id)).toEqual([
      early.id,
      tieA.id,
      tieB.id,
      late.id,
    ])
    expect(second.body).toEqual(first.body)
    expect(first.body.data[1].status).toBe('CANCELLED')
  })

  it('returns [] for a Ticket with no Actions and 404 for a missing Ticket', async () => {
    const ticketId = await makeTicket()
    const empty = await request(app)
      .get(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', sarah)
    expect(empty.status).toBe(200)
    expect(empty.body).toEqual({ data: [] })

    for (const id of [MISSING_ID, 'abc']) {
      const res = await request(app).get(`/api/staff/tickets/${id}/actions`).set('Cookie', sarah)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    }
  })
})

describe('API-03: create a valid Action Taken (AC-01, FR-01, BR-01, BR-04)', () => {
  it('saves under the path Ticket with performedBy = caller and assignedTo defaulting to the caller', async () => {
    const ticketId = await makeTicket()
    const res = await create(ticketId, valid())
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      ticketId,
      status: 'PLANNED',
      performedBy: { id: ids.sarah, name: 'Sarah Johnson', role: 'IT_STAFF' },
      assignedTo: { id: ids.sarah, name: 'Sarah Johnson', role: 'IT_STAFF', isActive: true },
      followUpRequired: false,
      followUpNote: null,
      result: null,
      attachmentNotes: null,
      version: 1,
    })
    // api-spec.md §0.5: display-safe user fields only, no idempotency key.
    expect(Object.keys(res.body.performedBy).sort()).toEqual(['id', 'name', 'role'])
    expect(Object.keys(res.body.assignedTo).sort()).toEqual(['id', 'isActive', 'name', 'role'])
    expect(res.body).not.toHaveProperty('clientRequestId')
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|email/)

    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(row).toMatchObject({ ticketId, performedById: ids.sarah, assignedToId: ids.sarah })
  })

  it('assigns the requested active IT Staff user', async () => {
    const ticketId = await makeTicket()
    const res = await create(ticketId, { ...valid(), assignedToId: ids.ahmed })
    expect(res.status).toBe(201)
    expect(res.body.assignedTo.id).toBe(ids.ahmed)
    expect(res.body.performedBy.id).toBe(ids.sarah)
  })

  it('lets an Administrator create, recorded as the performer', async () => {
    const ticketId = await makeTicket()
    const res = await create(
      ticketId,
      { ...valid(), status: 'DONE', result: 'Link is stable.', attachmentNotes: ' see log.txt ' },
      alex,
    )
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      status: 'DONE',
      result: 'Link is stable.',
      attachmentNotes: 'see log.txt',
      performedBy: { id: ids.alex, role: 'ADMINISTRATOR' },
      assignedTo: { id: ids.alex },
    })
  })
})

describe('API-04: spoofed performedById / ticketId (AC-03, BR-01, BR-03)', () => {
  it('ignores body identity fields on create and update', async () => {
    const ticketId = await makeTicket()
    const otherTicketId = await makeTicket()
    const res = await create(ticketId, {
      ...valid(),
      performedById: ids.ahmed,
      performedBy: { id: ids.ahmed },
      ticketId: otherTicketId,
      version: 7,
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ ticketId, performedBy: { id: ids.sarah }, version: 1 })

    const patched = await update(
      ticketId,
      res.body.id,
      {
        version: 1,
        description: 'Updated by Ahmed',
        performedById: ids.ahmed,
        ticketId: otherTicketId,
      },
      ahmed,
    )
    expect(patched.status).toBe(200)
    expect(patched.body).toMatchObject({ ticketId, performedBy: { id: ids.sarah } })
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(row).toMatchObject({ ticketId, performedById: ids.sarah })
  })
})

describe('API-05: follow-up note required (AC-04, BR-06)', () => {
  it('rejects a missing, empty, or whitespace note and saves nothing', async () => {
    const ticketId = await makeTicket()
    for (const note of [undefined, '', '   ']) {
      const res = await create(ticketId, { ...valid(), followUpRequired: true, followUpNote: note })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'followUpNote' })
    }
    expect(await countActions(ticketId)).toBe(0)
  })

  it('stores the note as null when follow-up is not required', async () => {
    const ticketId = await makeTicket()
    const res = await create(ticketId, {
      ...valid(),
      followUpRequired: false,
      followUpNote: 'Ignore me',
    })
    expect(res.status).toBe(201)
    expect(res.body.followUpNote).toBeNull()
  })

  it('requires a note when an update turns follow-up on', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId)
    const res = await update(ticketId, action.id, { version: 1, followUpRequired: true })
    expect(res.status).toBe(400)
    expect(res.body.error.field).toBe('followUpNote')
    const ok = await update(ticketId, action.id, {
      version: 1,
      followUpRequired: true,
      followUpNote: '  Call the user on Monday.  ',
    })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({
      followUpRequired: true,
      followUpNote: 'Call the user on Monday.',
    })
  })
})

describe('API-06: invalid assignee (AC-05, BR-04, BR-30)', () => {
  const invalid = () => [ids.linda, ids.jennifer, MISSING_ID]

  it('rejects inactive, Requester, and nonexistent assignees on create', async () => {
    const ticketId = await makeTicket()
    for (const assignedToId of invalid()) {
      const res = await create(ticketId, { ...valid(), assignedToId })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'INVALID_ASSIGNEE', field: 'assignedToId' })
    }
    expect(await countActions(ticketId)).toBe(0)
  })

  it('rejects them on update and leaves the Action unchanged', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId)
    for (const assignedToId of invalid()) {
      const res = await update(ticketId, action.id, { version: 1, assignedToId })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE')
    }
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })
    expect(row).toMatchObject({ assignedToId: ids.sarah, version: 1 })
  })

  it('accepts an Administrator as assignee', async () => {
    const ticketId = await makeTicket()
    const res = await create(ticketId, { ...valid(), assignedToId: ids.alex })
    expect(res.status).toBe(201)
    expect(res.body.assignedTo).toMatchObject({ id: ids.alex, role: 'ADMINISTRATOR' })
  })
})

describe('API-07: field validation (BR-05, BR-32)', () => {
  it('returns 400 naming the field for each bad value', async () => {
    const ticketId = await makeTicket()
    const cases: [object, string][] = [
      [{ description: '' }, 'description'],
      [{ description: '   ' }, 'description'],
      [{ description: 'x'.repeat(2001) }, 'description'],
      [{ result: 'x'.repeat(2001) }, 'result'],
      [{ attachmentNotes: 'x'.repeat(501) }, 'attachmentNotes'],
      [{ followUpRequired: true, followUpNote: 'x'.repeat(1001) }, 'followUpNote'],
      [{ actionAt: 'yesterday' }, 'actionAt'],
      [{ actionAt: '2026-10-06T10:00:00' }, 'actionAt'],
      [{ actionAt: '2026-02-31T10:00Z' }, 'actionAt'],
      [{ actionAt: '2026-04-31T09:00+07:00' }, 'actionAt'],
      [{ actionAt: '2026-03-01T24:00Z' }, 'actionAt'],
      [{ actionAt: '2026-02-29T10:00Z' }, 'actionAt'],
      [{ status: 'CANCELLED' }, 'status'],
      [{ status: 'FINISHED' }, 'status'],
      [{ assignedToId: 'sarah' }, 'assignedToId'],
      [{ followUpRequired: 'yes' }, 'followUpRequired'],
      [{ clientRequestId: 'not-a-uuid' }, 'clientRequestId'],
    ]
    for (const [override, field] of cases) {
      const res = await create(ticketId, { ...valid(), ...override })
      expect(res.status, JSON.stringify(override)).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field })
    }
    expect(await countActions(ticketId)).toBe(0)
  })

  it('returns 400, not 500, for a body-less request', async () => {
    const ticketId = await makeTicket()
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', sarah)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('accepts the Ticket creation minute and rejects anything earlier', async () => {
    const ticketId = await makeTicket({ createdAt: new Date('2026-01-01T10:00:30.000Z') })
    const early = await create(ticketId, { ...valid(), actionAt: '2026-01-01T09:59:59.000Z' })
    expect(early.status).toBe(400)
    expect(early.body.error.field).toBe('actionAt')
    const sameMinute = await create(ticketId, { ...valid(), actionAt: '2026-01-01T17:00:00+07:00' })
    expect(sameMinute.status).toBe(201)
    expect(sameMinute.body.actionAt).toBe('2026-01-01T10:00:00.000Z')
  })
})

describe('API-08: Done needs a Result and a past Action Date/Time (AC-09, BR-08)', () => {
  it('rejects Done without a Result on create and on update', async () => {
    const ticketId = await makeTicket()
    const created = await create(ticketId, { ...valid(), status: 'DONE', result: '  ' })
    expect(created.status).toBe(400)
    expect(created.body.error.field).toBe('result')

    const action = await seedAction(ticketId)
    const updated = await update(ticketId, action.id, { version: 1, status: 'DONE' })
    expect(updated.status).toBe(400)
    expect(updated.body.error.field).toBe('result')
  })

  it('rejects a Done Action dated more than 5 minutes ahead but allows future Planned work', async () => {
    const ticketId = await makeTicket()
    const future = new Date(Date.now() + 10 * 60_000).toISOString()
    const done = await create(ticketId, {
      ...valid(),
      actionAt: future,
      status: 'DONE',
      result: 'Ok',
    })
    expect(done.status).toBe(400)
    expect(done.body.error.field).toBe('actionAt')

    const planned = await create(ticketId, { ...valid(), actionAt: future })
    expect(planned.status).toBe(201)
    const promote = await update(ticketId, planned.body.id, {
      version: 1,
      status: 'DONE',
      result: 'Ok',
    })
    expect(promote.status).toBe(400)
    expect(promote.body.error.field).toBe('actionAt')
  })
})

describe('API-09: Action status transitions (FR-03, BR-07, AC-10)', () => {
  const permitted: [ActionStatus, ActionStatus][] = [
    ['PLANNED', 'IN_PROGRESS'],
    ['PLANNED', 'DONE'],
    ['PLANNED', 'CANCELLED'],
    ['IN_PROGRESS', 'PLANNED'],
    ['IN_PROGRESS', 'DONE'],
    ['IN_PROGRESS', 'CANCELLED'],
  ]

  it.each(permitted)('%s → %s succeeds and bumps version', async (from, to) => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId, { status: from })
    const res = await update(ticketId, action.id, { version: 1, status: to, result: 'Done it.' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: to, version: 2 })
  })

  it.each(['DONE', 'CANCELLED'] as const)('%s is final', async (from) => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId, { status: from })
    for (const to of ['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'].filter((s) => s !== from)) {
      const res = await update(ticketId, action.id, { version: 1, status: to })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('INVALID_ACTION_TRANSITION')
    }
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })
    expect(row).toMatchObject({ status: from, version: 1 })
  })
})

describe('API-10: field locks (AC-10, AC-11, BR-09)', () => {
  it('lets a Done Action clear its follow-up but not change its description', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId, {
      status: 'DONE',
      followUpRequired: true,
      followUpNote: 'Check again next week.',
    })
    const locked = await update(ticketId, action.id, { version: 1, description: 'Rewritten' })
    expect(locked.status).toBe(409)
    expect(locked.body.error).toMatchObject({ code: 'ACTION_LOCKED', field: 'description' })

    const cleared = await update(ticketId, action.id, {
      version: 1,
      followUpRequired: false,
      description: action.description,
      status: 'DONE',
    })
    expect(cleared.status).toBe(200)
    expect(cleared.body).toMatchObject({ followUpRequired: false, followUpNote: null, version: 2 })
  })

  it('rejects any change on a Cancelled Action but accepts unchanged values', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId, { status: 'CANCELLED' })
    const locked = await update(ticketId, action.id, { version: 1, attachmentNotes: 'new.pdf' })
    expect(locked.status).toBe(409)
    expect(locked.body.error).toMatchObject({ code: 'ACTION_LOCKED', field: 'attachmentNotes' })

    const unchanged = await update(ticketId, action.id, {
      version: 1,
      description: action.description,
      actionAt: action.actionAt.toISOString(),
      assignedToId: action.assignedToId,
      status: 'CANCELLED',
    })
    expect(unchanged.status).toBe(200)
    expect(unchanged.body.version).toBe(1)
  })
})

describe('API-11: stale Action update (AC-08, BR-25, BR-26)', () => {
  it('rejects the second of two updates from the same version with the current record', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId)
    const first = await update(ticketId, action.id, { version: 1, description: 'First edit' })
    const second = await update(
      ticketId,
      action.id,
      { version: 1, description: 'Second edit' },
      ahmed,
    )
    expect(first.status).toBe(200)
    expect(first.body.version).toBe(2)
    expect(second.status).toBe(409)
    expect(second.body.error).toMatchObject({ code: 'STALE_UPDATE', field: 'version' })
    expect(second.body.error.details.current).toEqual(first.body)

    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })
    expect(row).toMatchObject({ description: 'First edit', version: 2 })
  })

  it('lets exactly one of two concurrent updates win', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId)
    const results = await Promise.all([
      update(ticketId, action.id, { version: 1, description: 'Edit A' }),
      update(ticketId, action.id, { version: 1, description: 'Edit B' }, ahmed),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })
    expect(row.version).toBe(2)
  })
})

describe('API-12: version required (BR-25)', () => {
  it('rejects a missing or non-integer version', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId)
    for (const body of [
      { description: 'x' },
      { version: '1', description: 'x' },
      { version: 1.5 },
    ]) {
      const res = await update(ticketId, action.id, body)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'version' })
    }
  })

  it('treats a version-only or unchanged body as a no-op', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId)
    const res = await update(ticketId, action.id, { version: 1, description: action.description })
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
    const bare = await update(ticketId, action.id, { version: 1 })
    expect(bare.body.version).toBe(1)
  })
})

describe('API-13: non-active Ticket (AC-12, BR-10)', () => {
  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'] as const)(
    'rejects create and update on a %s Ticket',
    async (status) => {
      const ticketId = await makeTicket()
      const action = await seedAction(ticketId)
      await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: status } })

      const created = await create(ticketId, valid())
      const updated = await update(ticketId, action.id, { version: 1, description: 'Late edit' })
      for (const res of [created, updated]) {
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('TICKET_NOT_ACTIONABLE')
      }
      expect(await countActions(ticketId)).toBe(1)
    },
  )

  it('allows writes again once the Ticket is Reopened', async () => {
    const ticketId = await makeTicket({ status: 'REOPENED' })
    const res = await create(ticketId, valid())
    expect(res.status).toBe(201)
  })
})

describe('API-14: idempotent create (AC-13, BR-14, FR-06)', () => {
  it('returns the first Action on a sequential retry', async () => {
    const ticketId = await makeTicket()
    const body = { ...valid(), clientRequestId: randomUUID() }
    const first = await create(ticketId, body)
    const retry = await create(ticketId, body)
    expect(first.status).toBe(201)
    expect(retry.status).toBe(200)
    expect(retry.body).toEqual(first.body)
    expect(await countActions(ticketId)).toBe(1)
  })

  it('creates one row for two concurrent submissions', async () => {
    const ticketId = await makeTicket()
    const body = { ...valid(), clientRequestId: randomUUID() }
    const [a, b] = await Promise.all([create(ticketId, body), create(ticketId, body)])
    expect([a.status, b.status].sort()).toEqual([200, 201])
    expect(a.body.id).toBe(b.body.id)
    expect(await countActions(ticketId)).toBe(1)
  })

  it('scopes the key per user and per Ticket', async () => {
    const ticketId = await makeTicket()
    const otherTicketId = await makeTicket()
    const body = { ...valid(), clientRequestId: randomUUID() }
    expect((await create(ticketId, body)).status).toBe(201)
    expect((await create(ticketId, body, ahmed)).status).toBe(201)
    expect(await countActions(ticketId)).toBe(2)

    const elsewhere = await create(otherTicketId, body)
    expect(elsewhere.status).toBe(400)
    expect(elsewhere.body.error.field).toBe('clientRequestId')
    expect(await countActions(otherTicketId)).toBe(0)
  })

  it('replays a saved create after the Ticket was resolved', async () => {
    const ticketId = await makeTicket()
    const body = { ...valid(), clientRequestId: randomUUID() }
    const first = await create(ticketId, body)
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'RESOLVED' } })
    const retry = await create(ticketId, body)
    expect(retry.status).toBe(200)
    expect(retry.body.id).toBe(first.body.id)
  })

  it('creates a new Action every time without a key', async () => {
    const ticketId = await makeTicket()
    await create(ticketId, valid())
    await create(ticketId, valid())
    expect(await countActions(ticketId)).toBe(2)
  })
})

describe('API-15: multiple performers on one Ticket (AC-14, BR-02, BR-11)', () => {
  it('records Actions by the Owner, another IT Staff member, and an Administrator', async () => {
    const ticketId = await makeTicket({ ownerId: ids.sarah })
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    for (const cookie of [sarah, ahmed, alex]) {
      expect((await create(ticketId, valid(), cookie)).status).toBe(201)
    }
    const list = await request(app)
      .get(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', ahmed)
    const performers = list.body.data.map((a: { performedBy: { id: number } }) => a.performedBy.id)
    expect(new Set(performers)).toEqual(new Set([ids.sarah, ids.ahmed, ids.alex]))

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    expect(after.ownerId).toBe(ids.sarah)
    expect(after.version).toBe(before.version)
  })
})

describe('API-16: activity refreshes Ticket updatedAt, not version (BR-27)', () => {
  const OLD = new Date('2026-01-02T00:00:00.000Z')
  const touchedSince = async (ticketId: number, write: () => Promise<{ status: number }>) => {
    await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: OLD } })
    const res = await write()
    expect(res.status).toBeLessThan(300)
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    expect(ticket.updatedAt.getTime()).toBeGreaterThan(OLD.getTime())
    expect(ticket.version).toBe(1)
  }

  it('on Action create and update, Public Comment, and Internal Note', async () => {
    const ticketId = await makeTicket({ requesterId: ids.jennifer })
    const action = await seedAction(ticketId)
    await touchedSince(ticketId, () => create(ticketId, valid()))
    await touchedSince(ticketId, () =>
      update(ticketId, action.id, { version: 1, description: 'Edit' }),
    )
    await touchedSince(ticketId, () =>
      request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set('Cookie', jennifer)
        .send({ content: 'Any news?' }),
    )
    await touchedSince(ticketId, () =>
      request(app)
        .post(`/api/staff/tickets/${ticketId}/comments`)
        .set('Cookie', sarah)
        .send({ visibility: 'INTERNAL', content: 'Vendor contacted.' }),
    )
  })
})

describe('API-17: GET /api/tickets/:id/actions (AC-06, AC-07, FR-05, BR-12)', () => {
  it('shows the owning Requester every field in the staff order', async () => {
    const ticketId = await makeTicket({ requesterId: ids.jennifer })
    await seedAction(ticketId, { actionAt: new Date('2026-02-02T00:00:00.000Z') })
    const withNotes = await create(ticketId, {
      ...valid(),
      actionAt: '2026-02-01T00:00:00.000Z',
      followUpRequired: true,
      followUpNote: 'Confirm with the user.',
      attachmentNotes: 'screenshot.png',
    })
    expect(withNotes.status).toBe(201)

    const own = await request(app).get(`/api/tickets/${ticketId}/actions`).set('Cookie', jennifer)
    const staff = await request(app)
      .get(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', sarah)
    expect(own.status).toBe(200)
    expect(own.body).toEqual(staff.body)
    expect(own.body.data[0]).toMatchObject({
      followUpNote: 'Confirm with the user.',
      attachmentNotes: 'screenshot.png',
    })
  })

  it("returns 404 for another Requester's Ticket, identical to a missing one", async () => {
    const ticketId = await makeTicket({ requesterId: ids.jennifer })
    await seedAction(ticketId)
    const other = await request(app).get(`/api/tickets/${ticketId}/actions`).set('Cookie', michael)
    const missing = await request(app)
      .get(`/api/tickets/${MISSING_ID}/actions`)
      .set('Cookie', michael)
    expect(other.status).toBe(404)
    expect(other.body).toEqual(missing.body)
    expect(Object.keys(other.body)).toEqual(['error'])
  })

  it('returns 403 to IT Staff and has no write route', async () => {
    const ticketId = await makeTicket({ requesterId: ids.jennifer })
    const action = await seedAction(ticketId)
    const staff = await request(app).get(`/api/tickets/${ticketId}/actions`).set('Cookie', sarah)
    expect(staff.status).toBe(403)

    const post = await request(app)
      .post(`/api/tickets/${ticketId}/actions`)
      .set('Cookie', jennifer)
      .send(valid())
    const patch = await request(app)
      .patch(`/api/tickets/${ticketId}/actions/${action.id}`)
      .set('Cookie', jennifer)
      .send({ version: 1, description: 'x' })
    expect(post.status).toBe(404)
    expect(patch.status).toBe(404)
    expect(await countActions(ticketId)).toBe(1)
  })
})

describe('API-18: inactive existing assignee is kept (BR-04)', () => {
  it('saves an update that does not change the inactive assignee', async () => {
    const ticketId = await makeTicket()
    const action = await seedAction(ticketId, { assignedToId: ids.linda })
    const res = await update(ticketId, action.id, { version: 1, description: 'Still on it' })
    expect(res.status).toBe(200)
    expect(res.body.assignedTo).toMatchObject({ id: ids.linda, isActive: false })

    const resent = await update(ticketId, action.id, {
      version: 2,
      assignedToId: ids.linda,
      status: 'IN_PROGRESS',
    })
    expect(resent.status).toBe(200)
    expect(resent.body).toMatchObject({ status: 'IN_PROGRESS', version: 3 })
  })
})

describe('API-19: Action lookup (api-spec.md §2.3)', () => {
  it("returns 404 for another Ticket's Action, a missing Action, and a missing Ticket", async () => {
    const ticketA = await makeTicket()
    const ticketB = await makeTicket()
    const actionB = await seedAction(ticketB)
    for (const [t, a] of [
      [ticketA, actionB.id],
      [ticketA, MISSING_ID],
      [MISSING_ID, actionB.id],
    ]) {
      const res = await update(t!, a!, { version: 1, description: 'x' })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    }
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionB.id } })
    expect(row.version).toBe(1)
  })
})
