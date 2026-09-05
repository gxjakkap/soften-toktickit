import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '../../src/generated/prisma/client.js'
import { withSerializableRetry } from '../../src/lib/serializable-retry.js'

function serializationFailure() {
  return new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock.', {
    code: 'P2034',
    clientVersion: 'test',
  })
}

describe('withSerializableRetry', () => {
  it('retries a Postgres serialization failure (P2034) and returns the eventual success', async () => {
    let attempts = 0
    const fakeClient = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
        attempts += 1
        if (attempts < 2) throw serializationFailure()
        return fn({})
      }),
    }

    const result = await withSerializableRetry(fakeClient as never, async () => 'ok')

    expect(result).toBe('ok')
    expect(attempts).toBe(2)
  })

  it('gives up and rethrows after exhausting all attempts', async () => {
    const fakeClient = {
      $transaction: vi.fn(async () => {
        throw serializationFailure()
      }),
    }

    await expect(withSerializableRetry(fakeClient as never, async () => 'ok', 3)).rejects.toThrow(
      /write conflict/,
    )
    expect(fakeClient.$transaction).toHaveBeenCalledTimes(3)
  })

  it('rethrows immediately for an error that is not a serialization failure', async () => {
    const fakeClient = {
      $transaction: vi.fn(async () => {
        throw new Error('boom')
      }),
    }

    await expect(withSerializableRetry(fakeClient as never, async () => 'ok', 3)).rejects.toThrow('boom')
    expect(fakeClient.$transaction).toHaveBeenCalledTimes(1)
  })
})
