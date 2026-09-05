import type { APIRequestContext, Page } from '@playwright/test'

// specification.md §7.4 seed data (server/prisma/seed.ts) — used by name/email
// rather than hardcoded ids, which can differ across a fresh clone/reseed.
export const REQUESTERS = {
  // 14 seeded tickets: exceeds one page at the default page size of 10.
  jennifer: { name: 'Jennifer Anderson', email: 'jennifer.anderson@example.com' },
  // 3 seeded tickets: a second, distinct owner for cross-Requester isolation.
  michael: { name: 'Michael Brown', email: 'michael.brown@example.com' },
  // Zero seeded tickets: the empty-account state (BR-30).
  siriporn: { name: 'Siriporn Wattana', email: 'siriporn.wattana@example.com' },
  // isActive: false — must never appear in the Selection dropdown (AC-22).
  patricia: { name: 'Patricia Reyes', email: 'patricia.reyes@example.com' },
} as const

export const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 850, height: 1000 },
  mobile: { width: 500, height: 900 },
} as const

export type Requester = { id: number; name: string; email: string }

export async function findRequester(request: APIRequestContext, email: string): Promise<Requester> {
  const res = await request.get('/api/dev-requesters')
  const list = (await res.json()) as Requester[]
  const match = list.find((r) => r.email === email)
  if (!match) throw new Error(`Active requester not found for ${email}`)
  return match
}

/** Fast path for tests that don't need to exercise the Selection screen
 *  itself — matches how the app actually persists identity (BR-10). */
export async function loginViaStorage(page: Page, requester: Requester) {
  await page.addInitScript((stored) => {
    window.localStorage.setItem('toktickit.dev-requester', JSON.stringify(stored))
  }, requester)
}

/** Drives the real Selection screen UI — used by the screenshot suite so the
 *  screen's own states (loading/active-list/selected-user) are genuine. */
export async function loginViaUi(page: Page, requester: Requester) {
  await page.goto('/select-requester')
  await page.getByLabel(/development requester/i).waitFor({ state: 'visible' })
  await page.getByLabel(/development requester/i).selectOption(String(requester.id))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/tickets')
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

export async function createTicketViaApi(
  request: APIRequestContext,
  requesterId: number,
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
      requesterId,
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
