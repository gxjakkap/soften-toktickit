import type { Prisma } from '../generated/prisma/client.js'

// Lab 4 specification.md §5.3 (BR-24..BR-26) and §7.3-3: optimistic
// concurrency shared by the Ticket workflow writes (claim, reassign, IT
// Priority, Current Status) and the Action Taken update. Both check the
// `version` the client last read, then write with a conditional
// `UPDATE ... WHERE id = ? AND version = ?`.

export class StaleUpdateError extends Error {}

// BR-24/BR-25: a missing or non-integer version is a 400, checked before any read.
export const isVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

export const missingVersion = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'version is required and must be an integer.',
    field: 'version',
  },
}

// §7.3-3: the write is a conditional `UPDATE ... WHERE id = ? AND version = ?`
// that must touch exactly one row, so even a writer that skipped the earlier
// read-and-compare can't overwrite a newer version. A successful write bumps
// version by exactly 1.
export async function updateTicketAtVersion(
  tx: Prisma.TransactionClient,
  ticketId: number,
  version: number,
  data: Prisma.TicketUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.ticket.updateMany({
    where: { id: ticketId, version },
    data: { ...data, version: { increment: 1 } },
  })
  if (count !== 1) throw new StaleUpdateError()
}
