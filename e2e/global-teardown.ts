import { cleanFixtures } from './clean-fixtures.js'

// PR #55 review: the E2E suite creates throwaway Administrator/Requester
// fixture rows (every email ending `.test.invalid`) and Tickets filed under
// real seeded Requesters, with no per-test cleanup, since the Admin API has
// no delete endpoint (specification.md §3 Excluded) to clean up through.
// Without this, both accumulate run over run and show up as debris in the
// User Management and My Tickets screenshots. Runs once after the whole
// Playwright suite; see global-setup.ts for the before-the-run half and the
// two screenshot specs' own beforeAll for the within-this-run half (an
// earlier spec file's fixtures otherwise still exist when a later file in
// the same run captures its screenshot).
export default function globalTeardown() {
  cleanFixtures()
}
