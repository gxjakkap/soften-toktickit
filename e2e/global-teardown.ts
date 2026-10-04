import { execSync } from 'node:child_process'

// PR #55 review: the E2E suite creates throwaway Administrator/Requester
// fixture rows (every email ending `.test.invalid`, per authentication.spec.ts
// and user-administration.spec.ts) with no per-test cleanup, since the
// Admin API has no delete endpoint (specification.md §3 Excluded) to clean
// up through. Without this, the rows accumulate run over run and show up as
// debris in the User Management screenshots. Runs once after the whole
// Playwright suite.
//
// Shells out to the server package instead of importing its Prisma client
// directly: Playwright's own TS loader doesn't resolve the generated client
// correctly across this package boundary, even though plain `tsx` does.
export default function globalTeardown() {
  execSync('pnpm --filter server clean:e2e-fixtures', { stdio: 'inherit' })
}
