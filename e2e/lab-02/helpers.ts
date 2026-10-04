import type { APIRequestContext, Page } from '@playwright/test'

// specification.md §7.4 seed data (server/prisma/seed.ts) — used by name/email
// rather than hardcoded ids, which can differ across a fresh clone/reseed.
export const REQUESTERS = {
  // 14 seeded tickets: exceeds one page at the default page size of 10.
  jennifer: { name: 'Jennifer Anderson', email: 'jennifer.anderson@example.com' },
  // 3 seeded tickets: a second, distinct owner for cross-Requester isolation.
  michael: { name: 'Michael Brown', email: 'michael.brown@example.com' },
  // mustChangePassword: true — gated out of every protected route until
  // changed; not usable for ticket-browsing e2e flows (Issue #5).
  siriporn: { name: 'Siriporn Wattana', email: 'siriporn.wattana@example.com' },
  // Zero seeded tickets, no password gate: the empty-account state (BR-30).
  emma: { name: 'Emma Watson', email: 'emma.watson@example.com' },
  // isActive: false — login must be rejected (INACTIVE_ACCOUNT).
  patricia: { name: 'Patricia Reyes', email: 'patricia.reyes@example.com' },
} as const

// server/prisma/seed.ts: shared dev password for every seeded account.
export const SEED_PASSWORD = 'DevPass123!'

export const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 850, height: 1000 },
  mobile: { width: 500, height: 900 },
} as const

/** BR-03: identity now comes from a real session, not a client-supplied id.
 *  `request` can be the shared `request` fixture (a standalone cookie jar,
 *  for API-only fixture setup) or `page.request` (shares cookies with that
 *  page's browser context, so a subsequent page.goto() is authenticated). */
export async function loginViaApi(
  request: APIRequestContext,
  email: string,
  password = SEED_PASSWORD,
) {
  const res = await request.post('/api/auth/login', { data: { email, password } })
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()} ${await res.text()}`)
}

/** Drives the real Login screen UI — used where the test's point is to
 *  exercise the actual sign-in flow, not just get a session as fast as
 *  possible. `expectedUrl` defaults to a Requester's landing screen; pass
 *  the caller's actual role-default (or '**\/change-password') for other
 *  accounts (ui-spec.md §2). */
export async function loginViaUi(
  page: Page,
  email: string,
  password = SEED_PASSWORD,
  expectedUrl = '**/tickets',
) {
  await page.goto('/login')
  await page.getByLabel(/email address/i).fill(email)
  await page.getByLabel(/^password/i).fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(expectedUrl)
}

/** Create Ticket's Category/Related System selects render as soon as the
 *  page's reference-data fetch resolves; a scripted selectOption can land in
 *  the gap between that DOM mount and React committing the change handler,
 *  silently no-opping. Waiting for a real option is more robust than a flat
 *  sleep and never masks a genuine loading-state failure (it would time out
 *  instead of racing). Not an app bug — a human click is never this fast. */
export async function waitForCreateTicketReady(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('#category option').length > 1)
}

export async function referenceData(request: APIRequestContext) {
  const [categoriesRes, systemsRes] = await Promise.all([
    request.get('/api/categories'),
    request.get('/api/related-systems'),
  ])
  const categories = (await categoriesRes.json()) as { id: number; name: string }[]
  const relatedSystems = (await systemsRes.json()) as { id: number; name: string }[]
  return { categories, relatedSystems }
}

/** `request` must already be authenticated (via loginViaApi) as the intended
 *  owner — the Ticket's Requester is the session identity, never a body
 *  field (BR-03). */
export async function createTicketViaApi(
  request: APIRequestContext,
  overrides: Partial<{
    categoryId: number
    relatedSystemId: number
    requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH'
    summary: string
    description: string
  }> = {},
) {
  const { categories, relatedSystems } = await referenceData(request)
  const res = await request.post('/api/tickets', {
    data: {
      categoryId: overrides.categoryId ?? categories[0].id,
      relatedSystemId: overrides.relatedSystemId ?? relatedSystems[0].id,
      requestedPriority: overrides.requestedPriority ?? 'MEDIUM',
      summary: overrides.summary ?? 'E2E fixture ticket for automated screenshot/flow coverage',
      description:
        overrides.description ??
        'Created by the Lab 2 Playwright suite as fixture data; not a real support request.',
    },
  })
  if (!res.ok()) throw new Error(`createTicketViaApi failed: ${res.status()} ${await res.text()}`)
  return res.json() as Promise<{ id: number; ticketNumber: string; createdAt: string }>
}
