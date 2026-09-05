import type { PrismaClient } from '../generated/prisma/client.js'
import { Prisma } from '../generated/prisma/client.js'

// Postgres SERIALIZABLE (SSI) can raise a spurious "could not serialize
// access" conflict (SQLSTATE 40001 -> Prisma P2034) even for transactions
// that never really raced, because predicate locking is page-granular, not
// row-exact. Postgres' own docs require retrying on this code; it is not
// optional defensive coding.
const SERIALIZATION_FAILURE_CODE = 'P2034'
const DEFAULT_MAX_ATTEMPTS = 3

function isSerializationFailure(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === SERIALIZATION_FAILURE_CODE
}

export async function withSerializableRetry<T>(
  client: Pick<PrismaClient, '$transaction'>,
  fn: (tx: Parameters<PrismaClient['$transaction']>[0] extends (tx: infer Tx) => unknown ? Tx : never) => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (err) {
      if (!isSerializationFailure(err) || attempt === maxAttempts) throw err
    }
  }
  throw new Error('unreachable')
}
