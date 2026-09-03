import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { prisma } from '../../src/db.js'

// SCHEMA-08 (specification.md §7.4): the seed is re-runnable. Running it a
// second time must converge on the same rows, never duplicate them.

const serverDir = fileURLToPath(new URL('../..', import.meta.url))

function runSeed() {
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], { cwd: serverDir, stdio: 'pipe' })
}

async function snapshot() {
  return {
    categories: await prisma.category.findMany({ orderBy: { id: 'asc' } }),
    relatedSystems: await prisma.relatedSystem.findMany({ orderBy: { id: 'asc' } }),
  }
}

describe('prisma/seed.ts', () => {
  it('SCHEMA-08: seeds the required reference data and is safe to re-run', async () => {
    runSeed()
    const first = await snapshot()

    expect(first.categories.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Account and Access', 'Hardware', 'Software', 'Network']),
    )
    expect(first.relatedSystems.length).toBeGreaterThanOrEqual(6)
    expect(first.categories.every((c) => c.isActive)).toBe(true)
    expect(first.relatedSystems.every((s) => s.isActive)).toBe(true)

    runSeed()

    // Same rows, same ids: upserted by natural key, not re-inserted.
    expect(await snapshot()).toEqual(first)
  }, 60_000)
})
