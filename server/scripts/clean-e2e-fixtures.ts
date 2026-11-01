import { prisma } from '../src/db.js'

// Invoked by e2e/global-teardown.ts (and globalSetup, and the two
// screenshot specs' own beforeAll) via `pnpm --filter server`, not imported
// directly from e2e/ — Playwright's own TS loader doesn't resolve this
// package's generated Prisma client correctly across the package boundary
// (plain `tsx` does), so the cleanup has to run inside this package's own
// process instead.
//
// PR #55 review round 2: a `.test.invalid`-email filter alone misses every
// Ticket the E2E suite files under a real seeded Requester (jennifer.anderson
// mainly) — 318 of them, accumulated across many unrelated runs, long before
// this issue. prisma/seed.ts reserves ticketNumber 900001+ for seed rows
// specifically so a non-seed row is identifiable this way (see its own
// comment); everything outside that band is test debris.
const SEED_TICKET_NUMBER = /^TKT-\d{4}-9\d{5}$/

async function main() {
  const userWhere = { email: { endsWith: '.test.invalid' } }
  await prisma.ticketComment.deleteMany({ where: { author: userWhere } })
  await prisma.attachment.deleteMany({ where: { ticket: { requester: userWhere } } })
  // Lab 4 BR-22: history and Action rows are FK Restrict, so they go first.
  await prisma.ticketStatusHistory.deleteMany({
    where: { OR: [{ changedBy: userWhere }, { ticket: { requester: userWhere } }] },
  })
  await prisma.actionTaken.deleteMany({ where: { ticket: { requester: userWhere } } })
  await prisma.ticket.deleteMany({ where: { requester: userWhere } })
  const { count: users } = await prisma.user.deleteMany({ where: userWhere })

  const tickets = await prisma.ticket.findMany({ select: { id: true, ticketNumber: true } })
  const fixtureTicketIds = tickets
    .filter((t) => !SEED_TICKET_NUMBER.test(t.ticketNumber))
    .map((t) => t.id)
  const ticketWhere = { id: { in: fixtureTicketIds } }
  await prisma.ticketComment.deleteMany({ where: { ticket: ticketWhere } })
  await prisma.attachment.deleteMany({ where: ticketWhere })
  await prisma.ticketStatusHistory.deleteMany({ where: { ticket: ticketWhere } })
  await prisma.actionTaken.deleteMany({ where: { ticket: ticketWhere } })
  const { count: fixtureTickets } = await prisma.ticket.deleteMany({ where: ticketWhere })

  console.log(`cleaned ${users} e2e fixture user(s), ${fixtureTickets} fixture ticket(s)`)
  await prisma.$disconnect()
}

main()
