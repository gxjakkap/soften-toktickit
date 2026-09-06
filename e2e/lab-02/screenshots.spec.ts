import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  createTicketViaApi,
  findRequester,
  loginViaStorage,
  REQUESTERS,
  VIEWPORTS,
  waitForCreateTicketReady,
} from './helpers'

const PHOTO_FIXTURE = path.join(__dirname, 'fixtures/valid-photo.png')
// Not committed to the repo: an .exe-named fixture with a DOS-header magic
// byte can get quarantined by antivirus on clone/checkout. Written fresh to
// the OS temp dir instead — the server only checks extension + declared
// content type (BR-25), so the actual bytes never matter.
const UNSUPPORTED_FIXTURE = path.join(os.tmpdir(), 'toktickit-e2e-unsupported.exe')
fs.writeFileSync(UNSUPPORTED_FIXTURE, Buffer.from('not a real executable, just bytes for a rejection test'))

const shot = (...parts: string[]) => path.join(__dirname, '../../artifacts/lab-02/screenshots', ...parts)

// ---------------------------------------------------------------------------
// Section 14 / ui-spec.md §13: Development Requester Selection screen states.
// ---------------------------------------------------------------------------
test.describe('Screenshot audit: Development Requester Selection', () => {
  test('loaded screen, active-only dropdown, and selected-user/change-requester display', async ({ page }) => {
    await page.goto('/select-requester')
    await expect(page.getByRole('heading', { name: /select development requester/i })).toBeVisible()
    await page.screenshot({ path: shot('dev-requester-selection', 'screen.png'), fullPage: true })

    // AC-22: the seeded inactive Requester (Patricia Reyes) must never appear.
    const optionTexts = await page.locator('#dev-requester option').allTextContents()
    expect(optionTexts.some((t) => t.includes('Patricia'))).toBe(false)

    const jennifer = await findRequester(page.context().request, REQUESTERS.jennifer.email)
    await page.getByLabel(/development requester/i).selectOption(String(jennifer.id))
    await page.getByLabel(/development requester/i).focus()
    await page.screenshot({ path: shot('dev-requester-selection', 'active-dropdown.png'), fullPage: true })

    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL('**/tickets')
    await expect(page.getByTestId('current-requester')).toContainText('Jennifer Anderson')
    await page.screenshot({ path: shot('dev-requester-selection', 'selected-user-display.png'), fullPage: true })

    // Distinct from the capture above: focuses the actual Change Requester
    // control (BR-11) instead of re-shooting the same header state — a click
    // would navigate away before the shot, since it clears context immediately.
    await page.getByRole('button', { name: 'Change Requester' }).focus()
    await page.screenshot({ path: shot('dev-requester-selection', 'change-requester-action.png'), fullPage: true })
  })

  test('loading state', async ({ page }) => {
    await page.route('**/api/dev-requesters', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.continue()
    })
    const goto = page.goto('/select-requester')
    await expect(page.getByText(/loading development requesters/i)).toBeVisible()
    await page.screenshot({ path: shot('dev-requester-selection', 'loading.png'), fullPage: true })
    await goto
  })

  test('failure state', async ({ page }) => {
    await page.route('**/api/dev-requesters', (route) => route.fulfill({ status: 500, body: '{}' }))
    await page.goto('/select-requester')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    await page.screenshot({ path: shot('dev-requester-selection', 'failure.png'), fullPage: true })
  })
})

// ---------------------------------------------------------------------------
// Section 14: Create Ticket flow states.
// ---------------------------------------------------------------------------
test.describe('Screenshot audit: Create Ticket', () => {
  test('initial, validation failure, submitting, success, API failure, invalid attachment', async ({
    page,
    context,
  }) => {
    const jennifer = await findRequester(context.request, REQUESTERS.jennifer.email)
    await loginViaStorage(page, jennifer)
    await page.goto('/tickets/new')
    await expect(page.getByRole('heading', { name: 'Create Ticket' })).toBeVisible()
    await page.screenshot({ path: shot('create-ticket', 'initial.png'), fullPage: true })

    // Validation failure (AC-04, AC-05, AC-06, AC-26): submit blank.
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('Category is required.')).toBeVisible()
    await expect(page.getByText('Summary is required.')).toBeVisible()
    await page.screenshot({ path: shot('create-ticket', 'validation-failure.png'), fullPage: true })

    // Invalid attachment (AC-11/AC-12, client-side): one valid file alongside
    // one unsupported file type, so the accept/reject contrast is visible in
    // a single screenshot (Section 14: "one valid and one invalid attachment").
    await page.getByTestId('attachment-dropzone').click()
    await page.locator('#attachments').setInputFiles([PHOTO_FIXTURE, UNSUPPORTED_FIXTURE])
    await expect(page.getByText(/unsupported file type/i)).toBeVisible()
    await expect(page.getByText('valid-photo.png')).toBeVisible()
    await page.screenshot({ path: shot('create-ticket', 'invalid-attachment.png'), fullPage: true })
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await page.getByRole('button', { name: 'Remove' }).click()

    // Fill a valid form for the submitting/success/API-failure states below.
    await waitForCreateTicketReady(page)
    await page.getByLabel('Category').selectOption({ index: 1 })
    await page.getByLabel('Related System').selectOption({ index: 1 })
    await page.getByLabel('Requested Priority').selectOption('MEDIUM')
    await page.getByLabel('Summary').fill(`Screenshot fixture ticket ${Date.now()}`)
    await page.getByLabel('Description').fill('Filled in by the Playwright screenshot suite for Section 14 evidence.')

    // API failure (AC-08): server rejects, entered values must be preserved.
    await page.route('**/api/tickets', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }),
      }),
    )
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('alert')).toContainText(/something went wrong/i)
    await expect(page.getByLabel('Summary')).not.toHaveValue('')
    await page.screenshot({ path: shot('create-ticket', 'api-failure.png'), fullPage: true })
    await page.unroute('**/api/tickets')

    // Submitting (BR-22/AC-07): busy state while the request is in flight.
    await page.route('**/api/tickets', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    const submit = page.getByRole('button', { name: /submit/i }).click()
    await expect(page.getByRole('button', { name: 'Submitting…' })).toBeVisible()
    await page.screenshot({ path: shot('create-ticket', 'submitting.png'), fullPage: true })
    await submit

    // Success (AC-01).
    await expect(page.getByRole('status')).toContainText(/Ticket created: TKT-\d{4}-\d{6}/)
    await page.screenshot({ path: shot('create-ticket', 'success.png'), fullPage: true })
  })
})

// ---------------------------------------------------------------------------
// Section 14: My Tickets flow states.
// ---------------------------------------------------------------------------
test.describe('Screenshot audit: My Tickets', () => {
  test("Requester A's list vs. Requester B's list (isolation)", async ({ page, context }) => {
    const jennifer = await findRequester(context.request, REQUESTERS.jennifer.email)
    const michael = await findRequester(context.request, REQUESTERS.michael.email)

    await loginViaStorage(page, jennifer)
    await page.goto('/tickets')
    await expect(page.getByTestId('tickets-table')).toBeVisible()
    await page.screenshot({ path: shot('my-tickets', 'requester-a-list.png'), fullPage: true })

    await page.evaluate(() => window.localStorage.clear())
    await loginViaStorage(page, michael)
    await page.goto('/tickets')
    await expect(page.getByTestId('tickets-table')).toBeVisible()
    await page.screenshot({ path: shot('my-tickets', 'requester-b-list.png'), fullPage: true })
  })

  test('search, filters, sorting, pagination, empty state, no-results', async ({ page, context }) => {
    const jennifer = await findRequester(context.request, REQUESTERS.jennifer.email)
    const siriporn = await findRequester(context.request, REQUESTERS.siriporn.email)
    const searchTerm = `zephyr-${Date.now()}`
    await createTicketViaApi(context.request, jennifer.id, {
      summary: `Zephyr fixture ${searchTerm}`,
      requestedPriority: 'HIGH',
    })

    await loginViaStorage(page, jennifer)
    await page.goto('/tickets')

    // Search (AC-16).
    await page.getByLabel('Search').fill(searchTerm)
    await page.waitForTimeout(400) // debounced search (SEARCH_DEBOUNCE_MS)
    await expect(page.getByRole('link', { name: new RegExp('TKT-') })).toBeVisible()
    await page.screenshot({ path: shot('my-tickets', 'search.png'), fullPage: true })
    await page.getByRole('button', { name: 'Clear Filters' }).click()

    // Filters (AC-17).
    await page.getByLabel('Requested Priority', { exact: true }).selectOption('HIGH')
    await page.waitForTimeout(200)
    await page.screenshot({ path: shot('my-tickets', 'filters.png'), fullPage: true })
    await page.getByRole('button', { name: 'Clear Filters' }).click()

    // Sorting (BR-18).
    await page.getByRole('button', { name: /Summary/ }).click()
    await page.screenshot({ path: shot('my-tickets', 'sorting.png'), fullPage: true })

    // Pagination (AC-18): Jennifer has >10 seeded tickets.
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText(/Showing 11 to/)).toBeVisible()
    await page.screenshot({ path: shot('my-tickets', 'pagination.png'), fullPage: true })

    // No-results (AC-19): a filter combination matching nothing.
    await page.getByRole('button', { name: 'Clear Filters' }).click()
    await page.getByLabel('Search').fill('no-ticket-matches-this-string-xyz')
    await expect(page.getByText('No tickets match your filters')).toBeVisible()
    await page.screenshot({ path: shot('my-tickets', 'no-results.png'), fullPage: true })

    // Empty state (AC-20, BR-30): Siriporn Wattana owns zero tickets.
    await page.evaluate(() => window.localStorage.clear())
    await loginViaStorage(page, siriporn)
    await page.goto('/tickets')
    await expect(page.getByText("You haven't created any tickets yet")).toBeVisible()
    await page.screenshot({ path: shot('my-tickets', 'empty-state.png'), fullPage: true })
  })
})

// ---------------------------------------------------------------------------
// Section 14: Ticket Detail + Attachment lifecycle states.
// ---------------------------------------------------------------------------
test.describe('Screenshot audit: Ticket Detail and Attachments', () => {
  test('owned detail, add/download/remove attachment, retained metadata, blocked download', async ({
    page,
    context,
  }) => {
    const jennifer = await findRequester(context.request, REQUESTERS.jennifer.email)
    const ticket = await createTicketViaApi(context.request, jennifer.id, {
      summary: `Ticket detail screenshot fixture ${Date.now()}`,
    })

    await loginViaStorage(page, jennifer)
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByText(ticket.ticketNumber)).toBeVisible()
    await page.screenshot({ path: shot('ticket-detail', 'owned-detail.png'), fullPage: true })

    // Add attachment (FR-04).
    await page.getByTestId('attachment-dropzone').click()
    await page.locator('#attachments').setInputFiles(PHOTO_FIXTURE)
    const row = page.locator('li.zg-attachment-row', { hasText: 'valid-photo.png' })
    await expect(row.getByRole('link', { name: 'Download' })).toBeVisible()
    await page.screenshot({ path: shot('ticket-detail', 'add-attachment.png'), fullPage: true })

    // Download while active (FR-11/AC-15 contrast case).
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      row.getByRole('link', { name: 'Download' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('valid-photo.png')
    await page.screenshot({ path: shot('ticket-detail', 'download-active.png'), fullPage: true })

    // Soft removal with a reason (BR-27, §11-2 of specification.md).
    await row.getByRole('button', { name: 'Remove' }).click()
    await page.getByLabel('Reason (optional)').fill('Wrong file, re-uploading the correct one.')
    await page.screenshot({ path: shot('ticket-detail', 'remove-with-reason.png'), fullPage: true })
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()

    // Retained metadata (BR-28/AC-14): still listed, no Download action.
    await expect(row.getByText('Removed')).toBeVisible()
    await expect(row.getByRole('link', { name: 'Download' })).toHaveCount(0)
    await page.screenshot({ path: shot('ticket-detail', 'retained-metadata.png'), fullPage: true })

    // Blocked removed-download attempt (AC-15/BR-28): direct request now 410s.
    const attachmentId = await page.evaluate(async ({ ticketId, requesterId }) => {
      const res = await fetch(`/api/tickets/${ticketId}?requesterId=${requesterId}`)
      const body = (await res.json()) as { attachments: { id: number; originalFileName: string }[] }
      return body.attachments.find((a) => a.originalFileName === 'valid-photo.png')!.id
    }, { ticketId: ticket.id, requesterId: jennifer.id })
    const blocked = await context.request.get(`/api/attachments/${attachmentId}/download?requesterId=${jennifer.id}`)
    expect(blocked.status()).toBe(410)
    await page.screenshot({ path: shot('ticket-detail', 'blocked-removed-download.png'), fullPage: true })
  })

  test('unauthorized ticket-access rejection (BR-15/AC-03)', async ({ page, context }) => {
    const jennifer = await findRequester(context.request, REQUESTERS.jennifer.email)
    const michael = await findRequester(context.request, REQUESTERS.michael.email)
    const ownedByJennifer = await createTicketViaApi(context.request, jennifer.id, {
      summary: `Unauthorized-access fixture ${Date.now()}`,
    })

    await loginViaStorage(page, michael)
    await page.goto(`/tickets/${ownedByJennifer.id}`)
    await expect(page.getByText('Ticket not found.')).toBeVisible()
    await page.screenshot({ path: shot('ticket-detail', 'unauthorized-access.png'), fullPage: true })
  })
})

// ---------------------------------------------------------------------------
// STYLE-02/03/04: responsive screenshots at desktop/tablet/mobile (ui-spec §8,
// §13; AC-25). Superseded manual captures from Issue 8 with real Playwright
// evidence at the exact ui-spec.md §13 paths.
// ---------------------------------------------------------------------------
test.describe('STYLE-02/03/04 (AC-25): responsive screenshots', () => {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`create-ticket, my-tickets, ticket-detail at ${viewportName}`, async ({ page, context }) => {
      await page.setViewportSize(viewport)
      const jennifer = await findRequester(context.request, REQUESTERS.jennifer.email)
      const ticket = await createTicketViaApi(context.request, jennifer.id, {
        summary: `Responsive fixture ${viewportName} ${Date.now()}`,
      })
      await loginViaStorage(page, jennifer)

      const assertNoHorizontalScroll = async () => {
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1)
      }

      await page.goto('/tickets/new')
      await waitForCreateTicketReady(page)
      await assertNoHorizontalScroll()
      await page.screenshot({ path: shot('create-ticket', `${viewportName}.png`), fullPage: true })

      await page.goto('/tickets')
      await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
      await assertNoHorizontalScroll()
      await page.screenshot({ path: shot('my-tickets', `${viewportName}.png`), fullPage: true })

      await page.goto(`/tickets/${ticket.id}`)
      await expect(page.getByText(ticket.ticketNumber)).toBeVisible()
      await assertNoHorizontalScroll()
      await page.screenshot({ path: shot('ticket-detail', `${viewportName}.png`), fullPage: true })
    })
  }
})
