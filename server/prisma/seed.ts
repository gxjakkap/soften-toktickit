import 'dotenv/config'
import { createHash } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { PrismaClient, type TicketStatus } from '../src/generated/prisma/client.js'
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

// specification.md §8.4: 5 active + 1 inactive Requester, 3 active + 1 inactive
// IT Staff, 1 Administrator. Siriporn is the deterministic mustChangePassword
// fixture for the first-login flow (BR-02/BR-11); Emma is the empty-account
// fixture (Issue #5) — Siriporn can no longer serve both roles once real auth
// gates every protected route on mustChangePassword. Inactive accounts must
// never authenticate (BR-01/BR-07).
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
  // Issue #5: a Requester who is both active and free of the mustChangePassword
  // gate, with zero seeded Tickets — Siriporn can no longer double as the
  // empty-account fixture now that real auth enforces that gate on every
  // protected route, blocking a ticket-list check entirely.
  {
    name: 'Emma Watson',
    email: 'emma.watson@example.com',
    role: 'REQUESTER',
    isActive: true,
  },
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

// Active IT Staff who own the Lab 3 Tickets (Lab 3 BR-18). Lab 4 lets an
// Administrator own a Ticket too (Lab 4 BR-30); see lab4TicketSpecs below.
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
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

// Lab 4 specification.md §7.6 and BR-34: seed times are anchored to the start
// of the current Asia/Bangkok day (fixed +07:00, no DST), so two runs on the
// same Bangkok day write identical rows, and a run on a later day moves
// "today" and the 30-day window forward with it.
const now = Date.now()
const BANGKOK_OFFSET_MS = 7 * HOUR_MS
const bangkokToday = Math.floor((now + BANGKOK_OFFSET_MS) / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS
// ponytail: clamped to now, so a run in the first minute after Bangkok
// midnight writes a time that a second run would not repeat exactly.
const fromToday = (hours: number) => new Date(Math.min(bangkokToday + hours * HOUR_MS, now))

type TicketSeed = ReturnType<typeof ticketSpecs>[number] & {
  // Lab 4 Tickets only: resolvedAt this many days before today (0 = today).
  // Lab 3 Tickets that are Resolved or Closed get createdAt + 1 hour instead.
  resolvedDaysAgo?: number
}

// Lab 4 specification.md §7.6: Tickets added for the Actions Taken, workflow,
// and dashboard demos. The Lab 3 set has no active High IT Priority Ticket
// and no Administrator owner, so these add both. They belong to David, which
// leaves Jennifer's pagination demo (14 Tickets) and Michael's three active
// Tickets (no Waiting, no Resolved: the Requester zero-metric demo) as they
// were.
function lab4TicketSpecs(): TicketSeed[] {
  const base = {
    requesterEmail: 'david.chen@example.com',
    requesterConfirmedResolvedAt: null,
  }
  const daysAgo = (d: number) => new Date(now - d * DAY_MS)
  return [
    {
      ...base,
      summary: 'Laptop battery drains within an hour',
      description: 'My corporate laptop battery goes from full to empty in about an hour.',
      categoryName: 'Hardware',
      relatedSystemName: 'Corporate Laptop',
      requestedPriority: 'MEDIUM',
      itPriority: 'HIGH',
      currentStatus: 'IN_PROGRESS',
      ownerEmail: 'sarah.johnson@example.com',
      createdAt: daysAgo(6),
    },
    {
      ...base,
      summary: 'VPN disconnects every hour',
      description:
        'The VPN client drops the connection roughly every hour while working from home.',
      categoryName: 'Network',
      relatedSystemName: 'VPN',
      requestedPriority: 'HIGH',
      itPriority: 'HIGH',
      currentStatus: 'WAITING_FOR_REQUESTER',
      ownerEmail: 'ahmed.hassan@example.com',
      createdAt: daysAgo(5),
    },
    {
      ...base,
      summary: 'Shared printer on floor 3 keeps jamming',
      description:
        'The shared printer near the meeting rooms jams on almost every double-sided job.',
      categoryName: 'Hardware',
      relatedSystemName: 'Printer',
      requestedPriority: 'LOW',
      itPriority: 'MEDIUM',
      currentStatus: 'OPEN',
      ownerEmail: 'alex.morgan@example.com',
      createdAt: daysAgo(4),
    },
    {
      ...base,
      summary: 'Mailbox full again after cleanup',
      description: 'I cleared old mail last week but the mailbox is reporting full again.',
      categoryName: 'Software',
      relatedSystemName: 'Email',
      requestedPriority: 'MEDIUM',
      itPriority: 'HIGH',
      currentStatus: 'REOPENED',
      ownerEmail: null,
      createdAt: daysAgo(7),
    },
    {
      ...base,
      summary: 'Meeting room projector not detected',
      description: 'Laptops do not detect the projector in meeting room B over HDMI.',
      categoryName: 'Hardware',
      relatedSystemName: 'Corporate Laptop',
      requestedPriority: 'HIGH',
      itPriority: 'HIGH',
      currentStatus: 'RESOLVED',
      ownerEmail: 'ahmed.hassan@example.com',
      createdAt: daysAgo(3),
      resolvedDaysAgo: 0,
    },
    {
      ...base,
      summary: 'Locked out of grade submission app',
      description: 'The grade submission app locked my account after a password change.',
      categoryName: 'Account and Access',
      relatedSystemName: 'Grade Submission App',
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      currentStatus: 'CLOSED',
      ownerEmail: 'nattapong.srisuk@example.com',
      createdAt: daysAgo(45),
      resolvedDaysAgo: 40,
    },
  ]
}

const ticketSeeds = [
  ...ticketSpecs('jennifer.anderson@example.com', 14), // exceeds page 1 at the default page size of 10
  ...ticketSpecs('michael.brown@example.com', 3),
  ...ticketSpecs('david.chen@example.com', 5),
  // siriporn.wattana@example.com and emma.watson@example.com deliberately get
  // zero Tickets — Emma is the empty-state demo/e2e fixture (Issue #5);
  // Siriporn stays zero too, incidentally, but is seeded for mustChangePassword.
  ...lab4TicketSpecs(),
].map((spec: TicketSeed, i) => ({
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

// Indexes into ticketSeeds used by the Lab 4 seed rows below.
const T = {
  jenniferOpen: 1, // OPEN, owner Ahmed
  jenniferInProgress: 2, // IN_PROGRESS, owner Nattapong
  jenniferResolved: 4, // RESOLVED, unassigned
  jenniferClosedLegacy: 5, // CLOSED with resolvedAt and no Actions (§7.6 legacy-style case)
  jenniferResolved2: 12, // RESOLVED, owner Sarah
  jenniferClosed: 13, // CLOSED, owner Ahmed
  davidResolved: 21, // RESOLVED, unassigned
  battery: 22,
  vpn: 23,
  printer: 24,
  mailbox: 25,
  projector: 26,
  lockout: 27,
} as const

// Lab 4 specification.md §7.6: Actions Taken. Tickets not listed here have
// zero Actions. `at` is hours from the start of today (Bangkok); without it
// the Action is placed `minutesAfterCreated` after the Ticket's createdAt,
// which suits the Lab 3 Tickets whose createdAt was fixed by an earlier run.
// Nattapong is never the assignee of an open Action on an active Ticket, so
// his My Open Actions is 0 (BR-45 zero demo).
type ActionSeed = {
  ticket: number
  performedBy: string
  assignedTo?: string
  status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
  description: string
  result?: string
  followUpNote?: string
  attachmentNotes?: string
  at?: number
  minutesAfterCreated?: number
}

const SARAH = 'sarah.johnson@example.com'
const AHMED = 'ahmed.hassan@example.com'
const NATTAPONG = 'nattapong.srisuk@example.com'
const LINDA = 'linda.park@example.com'
const ALEX = 'alex.morgan@example.com'

const actionSeeds: ActionSeed[] = [
  // One Action each: the Done Action that lets a Lab 3 Resolved/Closed Ticket
  // pass the resolution gate (BR-18).
  ...[T.jenniferResolved, T.jenniferResolved2, T.jenniferClosed, T.davidResolved].map(
    (ticket): ActionSeed => ({
      ticket,
      performedBy: ticket === T.jenniferClosed ? AHMED : SARAH,
      status: 'DONE',
      description: 'Diagnosed the reported problem and applied the standard fix.',
      result: 'Requester confirmed the problem no longer occurs.',
      minutesAfterCreated: 30,
    }),
  ),
  // Active Ticket whose only Action is Planned (gate demo: OPEN_ACTIONS).
  {
    ticket: T.jenniferOpen,
    performedBy: AHMED,
    status: 'PLANNED',
    description: 'Schedule a desk visit to inspect the device.',
    minutesAfterCreated: 60,
  },
  // Several Actions on a Ticket owned by Nattapong, performed by others (BR-02).
  {
    ticket: T.jenniferInProgress,
    performedBy: AHMED,
    status: 'DONE',
    description: 'Collected logs from the affected machine.',
    result: 'Logs show repeated driver crashes after login.',
    attachmentNotes: 'Logs are attached to the Ticket as a zip file.',
    minutesAfterCreated: 45,
  },
  {
    ticket: T.jenniferInProgress,
    performedBy: SARAH,
    status: 'IN_PROGRESS',
    description: 'Test the vendor driver update on a spare laptop.',
    minutesAfterCreated: 120,
  },
  // Battery: owner Sarah; all four Action Statuses and four different people.
  {
    ticket: T.battery,
    performedBy: SARAH,
    status: 'DONE',
    description: 'Ran the battery health diagnostic.',
    result: 'Battery capacity is at 41% of design capacity.',
    attachmentNotes: 'See battery-diagnostic.pdf in the Ticket attachments.',
    at: -96,
  },
  {
    ticket: T.battery,
    performedBy: NATTAPONG,
    status: 'CANCELLED',
    description: 'Recalibrate the battery through the BIOS utility.',
    at: -72,
  },
  {
    ticket: T.battery,
    performedBy: AHMED,
    status: 'IN_PROGRESS',
    description: 'Order a replacement battery from the vendor.',
    at: -24,
  },
  {
    ticket: T.battery,
    performedBy: ALEX,
    assignedTo: SARAH,
    status: 'PLANNED',
    description: 'Install the replacement battery once it arrives.',
    at: 34, // tomorrow 10:00 Bangkok: scheduled work may be in the future (BR-08)
  },
  // VPN: owner Ahmed; Done with a pending follow-up (BR-48 non-zero), plus an
  // open Action assigned to the inactive Linda Park (BR-04 display demo).
  {
    ticket: T.vpn,
    performedBy: AHMED,
    status: 'DONE',
    description: 'Replaced the VPN profile with the current gateway settings.',
    result: 'Connection held for two hours during the remote session.',
    followUpNote: 'Confirm with the requester that the drops stopped after a full workday.',
    at: -48,
  },
  {
    ticket: T.vpn,
    performedBy: SARAH,
    assignedTo: LINDA,
    status: 'IN_PROGRESS',
    description: 'Check the home router firmware with the requester.',
    at: -30,
  },
  // Printer: owner Alex (Administrator); one Planned Action assigned to him.
  {
    ticket: T.printer,
    performedBy: ALEX,
    status: 'PLANNED',
    description: 'Replace the duplex roller on the floor 3 printer.',
    at: 10,
  },
  // Mailbox: unassigned Reopened Ticket with a second pending follow-up.
  {
    ticket: T.mailbox,
    performedBy: SARAH,
    status: 'DONE',
    description: 'Archived mail older than two years to the online archive.',
    result: 'Mailbox usage dropped from 100% to 62%.',
    followUpNote: 'Check whether the archive policy is applying automatically.',
    at: -120,
  },
  // Projector: resolved today (BR-50 non-zero). A Cancelled Action with a
  // follow-up does not block the gate (BR-18 c).
  {
    ticket: T.projector,
    performedBy: SARAH,
    assignedTo: AHMED,
    status: 'CANCELLED',
    description: 'Swap the HDMI cable in meeting room B.',
    followUpNote: 'Order spare HDMI cables for the meeting rooms.',
    at: -40,
  },
  {
    ticket: T.projector,
    performedBy: AHMED,
    status: 'DONE',
    description: 'Updated the projector firmware and reset its input settings.',
    result: 'Three different laptops now detect the projector over HDMI.',
    at: -2,
  },
  // Lockout: closed 40 days ago, outside the 30-day window (BR-42).
  {
    ticket: T.lockout,
    performedBy: NATTAPONG,
    status: 'DONE',
    description: 'Unlocked the account and reset the sign-in counter.',
    result: 'Requester signed in successfully.',
    at: -40 * 24 + 9,
  },
]

// Deterministic UUID per seed Action (§7.6 "fixed clientRequestId"). The
// (performedById, clientRequestId) unique key is what makes reruns upsert.
function seedRequestId(ticketNumber: string, description: string) {
  const h = createHash('sha256').update(`${ticketNumber}|${description}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

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

    // version is left to its default on create and never written on rerun, so a
    // demo that advanced it keeps its value (specification.md §7.6).
    const ticket = await prisma.ticket.upsert({
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

    // BR-21: resolvedAt for Resolved and Closed Tickets only.
    const resolved = spec.currentStatus === 'RESOLVED' || spec.currentStatus === 'CLOSED'
    const resolvedAt = !resolved
      ? null
      : spec.resolvedDaysAgo !== undefined
        ? fromToday(spec.resolvedDaysAgo === 0 ? 1 / 60 : -24 * spec.resolvedDaysAgo + 10)
        : new Date(ticket.createdAt.getTime() + HOUR_MS)
    if (ticket.resolvedAt?.getTime() !== resolvedAt?.getTime()) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { resolvedAt } })
    }

    // BR-22 / api-spec.md §0.5: a creation entry (null -> NEW, by the
    // Requester), then one entry from NEW to the seeded status, by the Owner or
    // the first active IT Staff user. Keyed on (ticket, from, to).
    const history: {
      fromStatus: TicketStatus | null
      toStatus: TicketStatus
      changedById: number
      changedAt: Date
    }[] = [
      { fromStatus: null, toStatus: 'NEW', changedById: requesterId, changedAt: ticket.createdAt },
    ]
    if (spec.currentStatus !== 'NEW') {
      history.push({
        fromStatus: 'NEW',
        toStatus: spec.currentStatus,
        changedById: ownerId ?? userIdByEmail.get(staffEmails[0])!,
        changedAt: resolvedAt ?? new Date(ticket.createdAt.getTime() + HOUR_MS),
      })
    }
    for (const entry of history) {
      const key = { ticketId: ticket.id, fromStatus: entry.fromStatus, toStatus: entry.toStatus }
      if (!(await prisma.ticketStatusHistory.findFirst({ where: key }))) {
        await prisma.ticketStatusHistory.create({ data: { ...entry, ticketId: ticket.id } })
      }
    }
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

  for (const a of actionSeeds) {
    const ticketNumber = ticketSeeds[a.ticket].ticketNumber
    const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } })
    const performedById = userIdByEmail.get(a.performedBy)
    const assignedToId = userIdByEmail.get(a.assignedTo ?? a.performedBy)
    if (!ticket || performedById === undefined || assignedToId === undefined) continue

    const clientRequestId = seedRequestId(ticketNumber, a.description)
    const fields = {
      assignedToId,
      // Only Planned work may sit in the future (BR-08); past times are
      // clamped to now by fromToday.
      actionAt:
        a.at === undefined
          ? new Date(ticket.createdAt.getTime() + (a.minutesAfterCreated ?? 0) * 60_000)
          : a.at > 0
            ? new Date(bangkokToday + a.at * HOUR_MS)
            : fromToday(a.at),
      description: a.description,
      result: a.result ?? null,
      status: a.status,
      followUpRequired: a.followUpNote !== undefined,
      followUpNote: a.followUpNote ?? null,
      attachmentNotes: a.attachmentNotes ?? null,
    }
    // version is left alone on rerun, as for Tickets.
    await prisma.actionTaken.upsert({
      where: { performedById_clientRequestId: { performedById, clientRequestId } },
      update: fields,
      create: { ...fields, ticketId: ticket.id, performedById, clientRequestId },
    })
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
