import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { formatTicketNumber } from '../src/lib/ticket-number.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const categories = ['Account and Access', 'Hardware', 'Software', 'Network']

// Related Systems (specification.md §7.4).
const relatedSystems = [
  'Email',
  'Campus Wi-Fi',
  'VPN',
  'LEB2 App',
  'Grade Submission App',
  'Printer',
  'Corporate Laptop',
]

// LOCAL DEVELOPMENT ONLY. Every seeded account shares this documented password
// (specification.md §8.4). It is not a real secret; never reuse it anywhere real.
const DEV_PASSWORD = 'DevPass123!'

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'

// specification.md §8.4: 4 active + 1 inactive Requester, 3 active + 1 inactive
// IT Staff, 1 Administrator. Siriporn is the deterministic mustChangePassword
// fixture for the first-login flow (BR-02/BR-11). Inactive accounts must never
// authenticate (BR-01/BR-07) or appear in the Lab 2 dev selector.
const users: {
  name: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword?: boolean
}[] = [
  {
    name: 'Jennifer Anderson',
    email: 'jennifer.anderson@example.com',
    role: 'REQUESTER',
    isActive: true,
  },
  { name: 'Michael Brown', email: 'michael.brown@example.com', role: 'REQUESTER', isActive: true },
  {
    name: 'Siriporn Wattana',
    email: 'siriporn.wattana@example.com',
    role: 'REQUESTER',
    isActive: true,
    mustChangePassword: true,
  },
  { name: 'David Chen', email: 'david.chen@example.com', role: 'REQUESTER', isActive: true },
  {
    name: 'Patricia Reyes',
    email: 'patricia.reyes@example.com',
    role: 'REQUESTER',
    isActive: false,
  },
  { name: 'Sarah Johnson', email: 'sarah.johnson@example.com', role: 'IT_STAFF', isActive: true },
  { name: 'Ahmed Hassan', email: 'ahmed.hassan@example.com', role: 'IT_STAFF', isActive: true },
  {
    name: 'Nattapong Srisuk',
    email: 'nattapong.srisuk@example.com',
    role: 'IT_STAFF',
    isActive: true,
  },
  { name: 'Linda Park', email: 'linda.park@example.com', role: 'IT_STAFF', isActive: false },
  { name: 'Alex Morgan', email: 'alex.morgan@example.com', role: 'ADMINISTRATOR', isActive: true },
]

// Active IT Staff who can own Tickets (BR-18); Administrators never own Tickets in Lab 3.
const staffEmails = users.filter((u) => u.role === 'IT_STAFF' && u.isActive).map((u) => u.email)

const STATUS_CYCLE = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
] as const
const PRIORITY_CYCLE = ['LOW', 'MEDIUM', 'HIGH'] as const

// specification.md §7.4: a spread of seeded Tickets per active Requester —
// enough for one Requester to exceed a page (pagination demo), one
// Requester with zero Tickets (empty-state demo), and status/priority
// variety (filter/sort/badge demo). Keyed on ticketNumber so reruns upsert
// instead of duplicating. Category/Related System are carried by name, not
// array index, so the upsert loop below can't silently reassign them if
// findMany ever returns those reference rows in a different order.
function ticketSpecs(requesterEmail: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const currentStatus = STATUS_CYCLE[i % STATUS_CYCLE.length]
    return {
      requesterEmail,
      categoryName: categories[i % categories.length],
      relatedSystemName: relatedSystems[i % relatedSystems.length],
      requestedPriority: PRIORITY_CYCLE[i % PRIORITY_CYCLE.length],
      // IT Priority differs from Requested Priority on every third Ticket.
      itPriority: PRIORITY_CYCLE[(i + (i % 3 === 2 ? 1 : 0)) % PRIORITY_CYCLE.length],
      currentStatus,
      // New Tickets and every fifth other Ticket stay unassigned; the rest rotate across active IT Staff.
      ownerEmail:
        currentStatus === 'NEW' || i % 5 === 4 ? null : staffEmails[i % staffEmails.length],
      requesterConfirmedResolvedAt:
        currentStatus === 'IN_PROGRESS' ? new Date(Date.now() - 60 * 60 * 1000) : null,
      summary: `Sample issue #${i + 1} for seed demo purposes`,
      description: `This is seeded demo Ticket #${i + 1}, included for filter, sort, and pagination demonstration.`,
      createdAt: new Date(Date.now() - (count - i) * 24 * 60 * 60 * 1000),
    }
  })
}

// BR-06 requires TKT-<year>-<6-digit> even for seed rows (a My Tickets
// screenshot has to show real-looking Ticket Numbers) — id can't be used
// since the number has to exist before the row does (upsert key), so a
// reserved high range (900001+) stands in for it: stable across reruns,
// obviously synthetic, still spec-shaped.
const ticketSeeds = [
  ...ticketSpecs('jennifer.anderson@example.com', 14), // exceeds page 1 at the default page size of 10
  ...ticketSpecs('michael.brown@example.com', 3),
  ...ticketSpecs('david.chen@example.com', 5),
  // siriporn.wattana@example.com deliberately gets zero Tickets (empty-state demo).
].map((spec, i) => ({
  ...spec,
  ticketNumber: formatTicketNumber(900001 + i, spec.createdAt.getFullYear()),
}))

// Seed comments (no sensitive content), addressed by index into ticketSeeds.
// Keyed on (ticket, author, visibility, content) for idempotency.
const commentSeeds: {
  ticketIndex: number
  authorEmail: string
  visibility: 'PUBLIC' | 'INTERNAL'
  content: string
}[] = [
  {
    ticketIndex: 1,
    authorEmail: 'sarah.johnson@example.com',
    visibility: 'PUBLIC',
    content: 'Thanks for reporting this. I am looking into it now.',
  },
  {
    ticketIndex: 1,
    authorEmail: 'jennifer.anderson@example.com',
    visibility: 'PUBLIC',
    content: 'It still happens every morning after I log in.',
  },
  {
    ticketIndex: 1,
    authorEmail: 'sarah.johnson@example.com',
    visibility: 'INTERNAL',
    content: "Looks similar to last week's VPN profile issue. Checking the config.",
  },
  {
    ticketIndex: 2,
    authorEmail: 'ahmed.hassan@example.com',
    visibility: 'PUBLIC',
    content: 'Could you tell us which building you are in?',
  },
  {
    ticketIndex: 2,
    authorEmail: 'ahmed.hassan@example.com',
    visibility: 'INTERNAL',
    content: 'Waiting on the requester before escalating to the network team.',
  },
  {
    ticketIndex: 3,
    authorEmail: 'nattapong.srisuk@example.com',
    visibility: 'INTERNAL',
    content: 'Reproduced on a test laptop. Vendor patch may be needed.',
  },
  {
    ticketIndex: 14,
    authorEmail: 'michael.brown@example.com',
    visibility: 'PUBLIC',
    content: 'Any update on this ticket?',
  },
]

async function main() {
  // Re-runnable and convergent: isActive is re-applied so a row deactivated
  // by hand returns to the seeded state, matching the requester loop below.
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: { name },
    })
  }

  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: { name },
    })
  }

  // Re-runnable: keyed on the unique email. A fresh bcrypt hash is only written
  // when the stored one does not already match DEV_PASSWORD, so reruns leave
  // rows untouched and the seeded state (including mustChangePassword) converges.
  for (const user of users) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } })
    const passwordHash =
      existing && (await bcrypt.compare(DEV_PASSWORD, existing.passwordHash))
        ? existing.passwordHash
        : await bcrypt.hash(DEV_PASSWORD, 10)
    const fields = {
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword ?? false,
      passwordHash,
    }
    await prisma.user.upsert({
      where: { email: user.email },
      update: fields,
      create: { email: user.email, ...fields },
    })
  }

  const categoryRows = await prisma.category.findMany({
    where: { name: { in: categories } },
    orderBy: { name: 'asc' },
  })
  const relatedSystemRows = await prisma.relatedSystem.findMany({
    where: { name: { in: relatedSystems } },
    orderBy: { name: 'asc' },
  })
  const userRows = await prisma.user.findMany({
    where: { email: { in: users.map((u) => u.email) } },
  })
  const userIdByEmail = new Map(userRows.map((u) => [u.email, u.id]))

  const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]))
  const relatedSystemIdByName = new Map(relatedSystemRows.map((s) => [s.name, s.id]))

  for (const spec of ticketSeeds) {
    const requesterId = userIdByEmail.get(spec.requesterEmail)
    const ownerId = spec.ownerEmail ? userIdByEmail.get(spec.ownerEmail) : null
    const categoryId = categoryIdByName.get(spec.categoryName)
    const relatedSystemId = relatedSystemIdByName.get(spec.relatedSystemName)
    if (requesterId === undefined || categoryId === undefined || relatedSystemId === undefined)
      continue

    await prisma.ticket.upsert({
      where: { ticketNumber: spec.ticketNumber },
      update: {
        requesterId,
        ownerId,
        categoryId,
        relatedSystemId,
        requestedPriority: spec.requestedPriority,
        itPriority: spec.itPriority,
        currentStatus: spec.currentStatus,
        summary: spec.summary,
        description: spec.description,
      },
      create: {
        ticketNumber: spec.ticketNumber,
        requesterId,
        ownerId,
        categoryId,
        relatedSystemId,
        requestedPriority: spec.requestedPriority,
        itPriority: spec.itPriority,
        requesterConfirmedResolvedAt: spec.requesterConfirmedResolvedAt,
        currentStatus: spec.currentStatus,
        summary: spec.summary,
        description: spec.description,
        createdAt: spec.createdAt,
      },
    })
  }

  // Comments have no natural key, so re-runs check for an identical row first.
  for (const c of commentSeeds) {
    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber: ticketSeeds[c.ticketIndex].ticketNumber },
    })
    const authorId = userIdByEmail.get(c.authorEmail)
    if (!ticket || authorId === undefined) continue
    const data = { ticketId: ticket.id, authorId, visibility: c.visibility, content: c.content }
    if (!(await prisma.ticketComment.findFirst({ where: data }))) {
      await prisma.ticketComment.create({ data })
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
