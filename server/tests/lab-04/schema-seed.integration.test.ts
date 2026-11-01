import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { prisma } from '../../src/db.js'

// MIG-06 (AC-40): specification.md §7.6 seed plan. The seed is idempotent and
// covers Tickets with zero, one, and many Actions Taken, every Ticket and
// Action status, and both zero and non-zero dashboard metrics.

const serverDir = fileURLToPath(new URL('../..', import.meta.url))
const runSeed = () =>
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], { cwd: serverDir, stdio: 'pipe' })

// Seed Tickets live in the reserved 9000xx number range (see lab-03 seed test).
const seededTickets = { ticketNumber: { contains: '-9000' } }
const ACTIVE = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const // BR-15
const DAY_MS = 24 * 60 * 60 * 1000
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const bangkokToday = () =>
  Math.floor((Date.now() + BANGKOK_OFFSET_MS) / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS

async function seededState() {
  const strip = <T extends { updatedAt: Date }>({ updatedAt: _, ...row }: T) => row
  return {
    tickets: (await prisma.ticket.findMany({ where: seededTickets, orderBy: { id: 'asc' } })).map(
      strip,
    ),
    actions: (
      await prisma.actionTaken.findMany({
        where: { ticket: seededTickets },
        orderBy: { id: 'asc' },
      })
    ).map(strip),
    history: await prisma.ticketStatusHistory.findMany({
      where: { ticket: seededTickets },
      orderBy: { id: 'asc' },
    }),
  }
}

const userId = async (email: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { email } })).id

describe('Lab 4 seed (specification.md §7.6)', () => {
  it('MIG-06: a second run produces identical Tickets, Actions, and history with the same ids', async () => {
    runSeed()
    const first = await seededState()
    expect(first.actions.length).toBeGreaterThan(0)
    runSeed()
    // Upserts bump updatedAt, so it is excluded, as in the Lab 3 seed test.
    expect(await seededState()).toEqual(first)
  }, 60_000)

  it('MIG-06: Tickets cover every status, every IT Priority, both ownerships, and 0/1/many Actions', async () => {
    const tickets = await prisma.ticket.findMany({
      where: seededTickets,
      include: { actionsTaken: true },
    })
    expect(new Set(tickets.map((t) => t.currentStatus)).size).toBe(8)
    expect(new Set(tickets.map((t) => t.itPriority))).toEqual(new Set(['LOW', 'MEDIUM', 'HIGH']))
    expect(tickets.some((t) => t.ownerId === null)).toBe(true)
    expect(tickets.some((t) => t.ownerId !== null)).toBe(true)

    const actionCounts = tickets.map((t) => t.actionsTaken.length)
    expect(actionCounts.filter((n) => n === 0).length).toBeGreaterThanOrEqual(3)
    expect(actionCounts.filter((n) => n === 1).length).toBeGreaterThanOrEqual(3)
    expect(actionCounts.filter((n) => n > 1).length).toBeGreaterThanOrEqual(3)

    const actions = tickets.flatMap((t) => t.actionsTaken)
    expect(new Set(actions.map((a) => a.status))).toEqual(
      new Set(['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
    )
    expect(tickets.every((t) => t.version >= 1)).toBe(true)
  })

  it('MIG-06 (BR-02): a Ticket has Actions performed by several people, including someone other than its Owner', async () => {
    const tickets = await prisma.ticket.findMany({
      where: { ...seededTickets, ownerId: { not: null } },
      include: { actionsTaken: true },
    })
    expect(
      tickets.some(
        (t) =>
          new Set(t.actionsTaken.map((a) => a.performedById)).size >= 3 &&
          t.actionsTaken.some((a) => a.performedById !== t.ownerId),
      ),
    ).toBe(true)
  })

  it('MIG-06 (BR-18): seeded Resolved/Closed Tickets pass the resolution gate, except the legacy-style one', async () => {
    const done = await prisma.ticket.findMany({
      where: { ...seededTickets, currentStatus: { in: ['RESOLVED', 'CLOSED'] } },
      include: { actionsTaken: true },
    })
    const legacy = done.filter((t) => t.actionsTaken.length === 0)
    expect(legacy).toHaveLength(1)
    expect(legacy[0].currentStatus).toBe('CLOSED')
    expect(legacy[0].resolvedAt).not.toBeNull()

    for (const t of done.filter((d) => d.actionsTaken.length > 0)) {
      const a = t.actionsTaken
      expect(
        a.some((x) => x.status === 'DONE'),
        t.ticketNumber,
      ).toBe(true)
      expect(a.some((x) => x.status === 'PLANNED' || x.status === 'IN_PROGRESS')).toBe(false)
      expect(a.some((x) => x.status !== 'CANCELLED' && x.followUpRequired)).toBe(false)
    }
    // BR-21: resolvedAt is set exactly on Resolved and Closed Tickets.
    const others = await prisma.ticket.count({
      where: {
        ...seededTickets,
        currentStatus: { notIn: ['RESOLVED', 'CLOSED'] },
        resolvedAt: { not: null },
      },
    })
    expect(others).toBe(0)
  })

  it('MIG-06: staff dashboard inputs are non-zero where the seed promises (BR-46, BR-48, BR-49, BR-50, BR-42)', async () => {
    const active = { ...seededTickets, currentStatus: { in: [...ACTIVE] } }
    expect(await prisma.ticket.count({ where: { ...active, ownerId: null } })).toBeGreaterThan(0)
    expect(await prisma.ticket.count({ where: { ...active, itPriority: 'HIGH' } })).toBeGreaterThan(
      0,
    )
    expect(
      await prisma.ticket.count({
        where: {
          ...active,
          actionsTaken: { some: { followUpRequired: true, status: { not: 'CANCELLED' } } },
        },
      }),
    ).toBeGreaterThanOrEqual(2)

    const today = new Date(bangkokToday())
    expect(
      await prisma.ticket.count({ where: { ...seededTickets, resolvedAt: { gte: today } } }),
    ).toBeGreaterThan(0)
    const windowStart = new Date(bangkokToday() - 29 * DAY_MS)
    expect(
      await prisma.ticket.count({ where: { ...seededTickets, resolvedAt: { gte: windowStart } } }),
    ).toBeGreaterThan(0)
    expect(
      await prisma.ticket.count({ where: { ...seededTickets, resolvedAt: { lt: windowStart } } }),
    ).toBeGreaterThan(0)
  })

  it('MIG-06: zero-metric demo users (Emma, Michael, Nattapong) and the Administrator demo (Alex)', async () => {
    // Emma: no Tickets at all (BR-40 empty state).
    expect(
      await prisma.ticket.count({
        where: { requesterId: await userId('emma.watson@example.com') },
      }),
    ).toBe(0)

    // Michael: open Tickets, but nothing Waiting and nothing resolved (BR-41, BR-42 = 0).
    const michael = { requesterId: await userId('michael.brown@example.com') }
    expect(
      await prisma.ticket.count({ where: { ...michael, currentStatus: { in: [...ACTIVE] } } }),
    ).toBeGreaterThan(0)
    expect(
      await prisma.ticket.count({ where: { ...michael, currentStatus: 'WAITING_FOR_REQUESTER' } }),
    ).toBe(0)
    expect(await prisma.ticket.count({ where: { ...michael, resolvedAt: { not: null } } })).toBe(0)

    // Nattapong: owns active Tickets but has no open assigned Actions (BR-45 = 0, BR-47 > 0).
    const nattapong = await userId('nattapong.srisuk@example.com')
    expect(
      await prisma.ticket.count({
        where: { ownerId: nattapong, currentStatus: { in: [...ACTIVE] } },
      }),
    ).toBeGreaterThan(0)
    expect(
      await prisma.actionTaken.count({
        where: {
          assignedToId: nattapong,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          ticket: { currentStatus: { in: [...ACTIVE] } },
        },
      }),
    ).toBe(0)

    // Alex (Administrator): owns an active Ticket and is assigned an open Action (BR-29, BR-30).
    const alex = await userId('alex.morgan@example.com')
    expect(
      await prisma.ticket.count({ where: { ownerId: alex, currentStatus: { in: [...ACTIVE] } } }),
    ).toBeGreaterThan(0)
    expect(
      await prisma.actionTaken.count({
        where: { assignedToId: alex, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      }),
    ).toBeGreaterThan(0)

    // BR-04 demo: an Action assigned to the inactive Linda Park.
    const linda = await prisma.user.findUniqueOrThrow({
      where: { email: 'linda.park@example.com' },
    })
    expect(linda.isActive).toBe(false)
    expect(await prisma.actionTaken.count({ where: { assignedToId: linda.id } })).toBeGreaterThan(0)
  })

  it('MIG-06 (BR-22): history has one creation entry per Ticket, and fromStatus is null only on it', async () => {
    const history = await prisma.ticketStatusHistory.findMany({ where: { ticket: seededTickets } })
    const creations = history.filter((h) => h.fromStatus === null)
    expect(creations.every((h) => h.toStatus === 'NEW')).toBe(true)
    expect(new Set(creations.map((h) => h.ticketId)).size).toBe(creations.length)
    expect(creations.length).toBe(await prisma.ticket.count({ where: seededTickets }))

    const nonNew = await prisma.ticket.findMany({
      where: { ...seededTickets, currentStatus: { not: 'NEW' } },
      select: { id: true, currentStatus: true },
    })
    for (const t of nonNew) {
      expect(
        history.some(
          (h) => h.ticketId === t.id && h.toStatus === t.currentStatus && h.fromStatus === 'NEW',
        ),
      ).toBe(true)
    }
  })
})
