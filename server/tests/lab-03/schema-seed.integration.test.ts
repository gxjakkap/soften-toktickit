import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/db.js'

// Issue #2, no API-nn/UI-nn/AC-nn: data-layer coverage of specification.md §8.2
// (schema constraints) and §8.4 (seed data), plus BR-09, BR-15, BR-18, BR-27.

const serverDir = fileURLToPath(new URL('../..', import.meta.url))
const TAG = 'lab3.schema.test.invalid'
const runSeed = () =>
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], { cwd: serverDir, stdio: 'pipe' })

// Seed tickets live in the reserved 9000xx number range; other files' fixtures are excluded.
const seededTickets = { ticketNumber: { contains: '-9000' } }

const withoutUpdatedAt = (state: Awaited<ReturnType<typeof seededState>>) => ({
  users: state.users.map(({ updatedAt: _, ...u }) => u),
  tickets: state.tickets.map(({ updatedAt: _, ...t }) => t),
  comments: state.comments,
})

async function seededState() {
  return {
    users: await prisma.user.findMany({
      where: { email: { endsWith: '@example.com' } },
      orderBy: { id: 'asc' },
    }),
    tickets: await prisma.ticket.findMany({ where: seededTickets, orderBy: { id: 'asc' } }),
    comments: await prisma.ticketComment.findMany({
      where: { ticket: seededTickets },
      orderBy: { id: 'asc' },
    }),
  }
}

describe('seed script (specification.md §8.4)', () => {
  it('meets the account minimums, hashes every password, and is idempotent', async () => {
    runSeed()
    const first = await seededState()

    const count = (role: string, isActive: boolean) =>
      first.users.filter((u) => u.role === role && u.isActive === isActive).length
    expect(count('REQUESTER', true)).toBeGreaterThanOrEqual(4)
    expect(count('REQUESTER', false)).toBeGreaterThanOrEqual(1)
    expect(count('IT_STAFF', true)).toBeGreaterThanOrEqual(3)
    expect(count('IT_STAFF', false)).toBeGreaterThanOrEqual(1)
    expect(count('ADMINISTRATOR', true)).toBeGreaterThanOrEqual(1)
    expect(first.users.some((u) => u.mustChangePassword)).toBe(true)

    // BR-09: only bcrypt hashes of the documented dev password are stored.
    for (const user of first.users) {
      expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/)
      expect(user.passwordHash).not.toContain('DevPass123!')
      expect(await bcrypt.compare('DevPass123!', user.passwordHash)).toBe(true)
    }

    runSeed()
    // Same rows, ids and hashes: nothing duplicated or regenerated. Upserts still
    // bump updatedAt, so it is excluded.
    expect(withoutUpdatedAt(await seededState())).toEqual(withoutUpdatedAt(first))
  }, 60_000)

  it('spreads tickets across owners, statuses and priorities, and seeds both comment kinds', async () => {
    const tickets = await prisma.ticket.findMany({
      where: seededTickets,
      include: { owner: true, requester: true },
    })

    expect(tickets.some((t) => t.ownerId === null)).toBe(true)
    const owners = new Set(tickets.map((t) => t.ownerId).filter((id) => id !== null))
    expect(owners.size).toBeGreaterThanOrEqual(2)
    for (const t of tickets) {
      expect(t.requester.role).toBe('REQUESTER') // BR-17
      if (t.owner) {
        expect(t.owner.role).toBe('IT_STAFF') // BR-18
        expect(t.owner.isActive).toBe(true)
      }
    }
    expect(new Set(tickets.map((t) => t.currentStatus)).size).toBeGreaterThanOrEqual(5)
    expect(tickets.some((t) => t.itPriority !== t.requestedPriority)).toBe(true)
    expect(tickets.every((t) => t.itPriority)).toBe(true)

    const kinds = await prisma.ticketComment.groupBy({
      by: ['visibility'],
      where: { ticket: seededTickets },
      _count: true,
    })
    expect(kinds.map((k) => k.visibility).sort()).toEqual(['INTERNAL', 'PUBLIC'])
  })
})

describe('schema constraints (specification.md §8.2)', () => {
  let requesterId: number
  let staffId: number
  let categoryId: number
  let relatedSystemId: number

  const newUser = (name: string, role: 'REQUESTER' | 'IT_STAFF' = 'REQUESTER') =>
    prisma.user.create({
      data: { name, email: `${name}.${TAG}`, passwordHash: 'not-a-real-hash', role },
    })

  const newTicket = (overrides: Record<string, unknown> = {}) =>
    prisma.ticket.create({
      data: {
        ticketNumber: `TKT-2026-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
        requesterId,
        categoryId,
        relatedSystemId,
        requestedPriority: 'LOW',
        itPriority: 'LOW',
        summary: `Fixture ticket ${TAG}`,
        description: 'A description long enough to look like a real ticket body.',
        ...overrides,
      },
    })

  async function wipe() {
    await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } }) // cascades comments
    await prisma.user.deleteMany({ where: { email: { contains: TAG } } }) // cascades sessions
    await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
    await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
  }

  beforeAll(async () => {
    await wipe()
    requesterId = (await newUser('requester')).id
    staffId = (await newUser('staff', 'IT_STAFF')).id
    categoryId = (await prisma.category.create({ data: { name: `Category ${TAG}` } })).id
    relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })).id
  })

  afterAll(wipe)

  it('rejects a duplicate email (P2002) and a non-lower-case email (BR-15)', async () => {
    await expect(newUser('requester')).rejects.toMatchObject({ code: 'P2002' })
    await expect(
      prisma.user.create({
        data: { name: 'Caps', email: `Caps.${TAG}`, passwordHash: 'h', role: 'REQUESTER' },
      }),
    ).rejects.toThrow()
  })

  it('defaults: user is active and does not need a password change; ticket is NEW, unowned, unconfirmed', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })
    expect(user.isActive).toBe(true)
    expect(user.mustChangePassword).toBe(false)

    const ticket = await newTicket()
    expect(ticket.currentStatus).toBe('NEW')
    expect(ticket.ownerId).toBeNull()
    expect(ticket.requesterConfirmedResolvedAt).toBeNull()
  })

  it('accepts an IT Staff owner and rejects one that does not exist (P2003)', async () => {
    expect((await newTicket({ ownerId: staffId })).ownerId).toBe(staffId)
    await expect(newTicket({ ownerId: -1 })).rejects.toMatchObject({ code: 'P2003' })
  })

  it('deleting an owner unassigns their tickets; deleting a requester who filed tickets is refused', async () => {
    const owner = await newUser('temp-owner', 'IT_STAFF')
    const ticket = await newTicket({ ownerId: owner.id })

    await prisma.user.delete({ where: { id: owner.id } })
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).ownerId).toBeNull()

    await expect(prisma.user.delete({ where: { id: requesterId } })).rejects.toMatchObject({
      code: 'P2003',
    })
  })

  it('comments: author and ticket must exist; author with comments cannot be deleted; ticket delete cascades', async () => {
    const author = await newUser('commenter', 'IT_STAFF')
    const ticket = await newTicket()
    const data = { ticketId: ticket.id, authorId: author.id, content: 'Looking into it.' }

    await expect(
      prisma.ticketComment.create({ data: { ...data, authorId: -1, visibility: 'PUBLIC' } }),
    ).rejects.toMatchObject({ code: 'P2003' })
    await prisma.ticketComment.create({ data: { ...data, visibility: 'INTERNAL' } })

    await expect(prisma.user.delete({ where: { id: author.id } })).rejects.toMatchObject({
      code: 'P2003',
    })

    await prisma.ticket.delete({ where: { id: ticket.id } })
    expect(await prisma.ticketComment.count({ where: { ticketId: ticket.id } })).toBe(0)
  })

  it('sessions cascade with their user and token hashes are unique', async () => {
    const user = await newUser('session-owner')
    const session = { userId: user.id, expiresAt: new Date(Date.now() + 3600_000) }
    await prisma.session.create({ data: { ...session, tokenHash: `hash-${TAG}` } })
    await expect(
      prisma.session.create({ data: { ...session, tokenHash: `hash-${TAG}` } }),
    ).rejects.toMatchObject({ code: 'P2002' })

    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
  })

  it('indexes exist for the Queue lookups (owner, requester, status, IT priority) and role', async () => {
    const defs = async (table: string) =>
      (
        await prisma.$queryRaw<{ indexdef: string }[]>`
          SELECT indexdef FROM pg_indexes WHERE tablename = ${table}`
      )
        .map((i) => i.indexdef)
        .join('\n')

    const ticketIndexes = await defs('Ticket')
    for (const column of ['ownerId', 'requesterId', 'currentStatus', 'itPriority']) {
      expect(ticketIndexes, `Ticket index on ${column}`).toContain(`("${column}")`)
    }
    expect(await defs('User')).toContain('(role)')
    expect(await defs('TicketComment')).toContain('("ticketId", visibility)')
  })
})
