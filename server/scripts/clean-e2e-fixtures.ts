import { prisma } from '../src/db.js'

// Invoked by e2e/global-teardown.ts via `pnpm --filter server`, not
// imported directly from e2e/ — Playwright's own TS loader doesn't resolve
// this package's generated Prisma client correctly across the package
// boundary (plain `tsx` does), so the cleanup has to run inside this
// package's own process instead.
async function main() {
  const where = { email: { endsWith: '.test.invalid' } }
  await prisma.ticketComment.deleteMany({ where: { author: where } })
  await prisma.attachment.deleteMany({ where: { ticket: { requester: where } } })
  await prisma.ticket.deleteMany({ where: { requester: where } })
  const { count } = await prisma.user.deleteMany({ where })
  console.log(`cleaned ${count} e2e fixture user(s)`)
  await prisma.$disconnect()
}

main()
