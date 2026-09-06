import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Test files share one real Postgres instance with no per-test
    // transaction isolation; running files in parallel lets unrelated
    // Serializable attachment transactions (app.ts) collide on Postgres'
    // page-level predicate locks and fail with spurious write conflicts.
    fileParallelism: false,
  },
})
