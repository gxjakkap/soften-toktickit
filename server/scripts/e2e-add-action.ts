import { prisma } from '../src/db.js'

// Lab 4 e2e/lab-04/ticket-resolution.spec.ts: adds one Action Taken to an E2E
// fixture Ticket, so the spec can satisfy or fail the resolution gate
// (specification.md BR-18) without the Actions Taken API or UI (Issues #63,
// #65). Runs in this package for the same reason as clean-e2e-fixtures.ts,
// whose cleanup removes the Action with its Ticket.
// Usage: pnpm --filter server exec tsx scripts/e2e-add-action.ts <ticketId> <staffEmail> <DONE|PLANNED>
async function main() {
  const [ticketId, staffEmail, status] = process.argv.slice(2)
  if (status !== 'DONE' && status !== 'PLANNED') throw new Error(`unsupported status: ${status}`)
  const staff = await prisma.user.findUniqueOrThrow({ where: { email: staffEmail } })
  await prisma.actionTaken.create({
    data: {
      ticketId: Number(ticketId),
      performedById: staff.id,
      assignedToId: staff.id,
      actionAt: new Date(),
      description: status === 'DONE' ? 'Replaced the faulty part.' : 'Schedule a follow-up visit.',
      result: status === 'DONE' ? 'Verified working with the requester.' : null,
      status,
    },
  })
  await prisma.$disconnect()
}

main()
