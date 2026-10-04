import { execSync } from 'node:child_process'

// Shared by global-setup.ts, global-teardown.ts, and the two screenshot
// specs' own beforeAll (screenshots.spec.ts, staff-and-admin-screenshots.spec.ts).
// Shells out to the server package instead of importing its Prisma client
// directly: Playwright's own TS loader doesn't resolve the generated client
// correctly across this package boundary, even though plain `tsx` does.
export function cleanFixtures() {
  execSync('pnpm --filter server clean:e2e-fixtures', { stdio: 'inherit' })
}
