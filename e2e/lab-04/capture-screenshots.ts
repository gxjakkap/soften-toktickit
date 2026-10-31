import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { cleanFixtures } from '../clean-fixtures'
import { createTicketViaApi, loginViaApi, REQUESTERS } from '../lab-02/helpers'

// STYLE-01, STYLE-02 — AC-41: docs/lab-04 ui-spec.md §13 (Issue #71).
// Captures the release screenshots under artifacts/lab-04/screenshots/ at
// 1440, 768, and 375 px. Each capture first asserts no horizontal page
// scroll (DoD "backed by an automated no-horizontal-scroll assertion").
//
// Run on demand against a freshly migrated and seeded database:
//   pnpm screenshots
// The default `pnpm e2e` run never picks this file up
// (playwright.screenshots.config.ts).
//
// Seeded data is only read. Every write goes to a fixture Ticket or user
// that e2e/clean-fixtures.ts removes before and after the run, and the
// seeded-data screens are captured before any fixture exists, so their
// numbers match the README demo accounts.

const OUT = path.join(__dirname, '../../artifacts/lab-04/screenshots')
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const
type Viewport = keyof typeof VIEWPORTS
const ALL: Viewport[] = ['desktop', 'tablet', 'mobile']

const SARAH = 'sarah.johnson@example.com'
const AHMED = 'ahmed.hassan@example.com'
const NATTAPONG = 'nattapong.srisuk@example.com'
const ADMIN = 'alex.morgan@example.com'
const DAVID = 'david.chen@example.com'

const STAMP = Date.now()

test.describe.configure({ mode: 'serial', timeout: 600_000 })
test.beforeAll(cleanFixtures)
test.afterAll(cleanFixtures)

/** Saves `<folder>/<viewport>-<name>.png` for each viewport, keeping the
 *  page's current state (open forms, banners) across the resize. */
async function snap(page: Page, folder: string, name: string, viewports: Viewport[] = ALL) {
  for (const viewport of viewports) {
    await page.setViewportSize(VIEWPORTS[viewport])
    // Let the layout settle after the resize, with no hover state left over.
    await page.mouse.move(0, 0)
    await page.waitForTimeout(150)
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(
      scrollWidth,
      `${folder}/${viewport}-${name}: horizontal page scroll`,
    ).toBeLessThanOrEqual(innerWidth)
    await page.screenshot({
      path: path.join(OUT, folder, `${viewport}-${name}.png`),
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    })
  }
  await page.setViewportSize(VIEWPORTS.desktop)
}

async function session(browser: Browser, email?: string) {
  const context = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: VIEWPORTS.desktop,
  })
  const page = await context.newPage()
  if (email) await loginViaApi(page.request, email)
  return page
}

const h1 = (page: Page, name: string | RegExp) =>
  expect(page.getByRole('heading', { level: 1, name })).toBeVisible()

const forbidden = (page: Page) => h1(page, "You don't have access to this page.")

const actionsArea = (page: Page) => page.locator('#actions-taken')
const actionRow = (page: Page, text: string) =>
  actionsArea(page).getByTestId('action-row').filter({ hasText: text })

async function openStaffTicket(page: Page, id: number) {
  await page.goto(`/staff/tickets/${id}`)
  await expect(
    actionsArea(page).getByRole('heading', { name: /^Actions Taken \(\d+\)$/ }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Status History' })).toBeVisible()
  await page.waitForLoadState('networkidle')
}

/** A native <select> popup is never part of a page screenshot, so the
 *  Current Status control is shown as an open list box (size attribute)
 *  for the capture only. Its options are exactly what the app rendered. */
async function expandStatusOptions(page: Page) {
  const select = page.getByLabel(/current status/i)
  await select.evaluate((el: HTMLSelectElement) => {
    el.size = el.options.length
  })
  return select
}

async function ticketIdByNumber(page: Page, ticketNumber: string) {
  const res = await page.request.get(`/api/staff/tickets?search=${ticketNumber}`)
  return ((await res.json()) as { data: { id: number }[] }).data[0]!.id
}

// ---------------------------------------------------------------------------
// Seeded data only (captured before any fixture exists).
// ---------------------------------------------------------------------------

test('staff-dashboard: seeded states', async ({ browser }) => {
  const page = await session(browser, SARAH)
  await page.goto('/dashboard')
  await h1(page, 'Dashboard')
  await expect(page.getByRole('region', { name: 'Recently Updated' })).toBeVisible()
  await snap(page, 'staff-dashboard', 'with-data')

  // Loading: hold the dashboard request until the skeleton is captured.
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/dashboard/staff', async (route) => {
    await held
    // React's dev StrictMode may have dropped the first request already.
    await route.continue().catch(() => {})
  })
  await page.goto('/dashboard')
  await expect(page.locator('.zg-skeleton').first()).toBeVisible()
  await snap(page, 'staff-dashboard', 'loading')
  release()
  await page.unroute('**/api/dashboard/staff', { behavior: 'ignoreErrors' })

  // Safe failure: the API answers 500; no partial numbers, Retry offered.
  await page.route('**/api/dashboard/staff', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
      }),
    }),
  )
  await page.goto('/dashboard')
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await snap(page, 'staff-dashboard', 'safe-failure')
  await page.unroute('**/api/dashboard/staff')

  // Drill-down: the Unassigned card opens the filtered Queue with chips.
  await page.goto('/dashboard')
  await page.getByRole('link', { name: /^Unassigned: \d+\. View tickets$/ }).click()
  await expect(page).toHaveURL(/\/staff\/tickets\?ownerId=unassigned&statusGroup=active/)
  await h1(page, 'Ticket Queue')
  await expect(page.getByRole('button', { name: /^Remove filter:/ }).first()).toBeVisible()
  await snap(page, 'staff-dashboard', 'drilldown-unassigned-queue')

  await page.goto('/dashboard')
  await page.getByRole('link', { name: /^My Open Actions: \d+\. View tickets$/ }).click()
  await expect(page).toHaveURL(/openActionAssigneeId=\d+&statusGroup=active/)
  await expect(page.getByRole('button', { name: /^Remove filter:/ }).first()).toBeVisible()
  await snap(page, 'staff-dashboard', 'drilldown-my-open-actions-queue')
  await page.context().close()

  // Seeded zero-data scope: Nattapong has no open Actions assigned.
  const zero = await session(browser, NATTAPONG)
  await zero.goto('/dashboard')
  await expect(zero.getByText('No open actions assigned to you.').first()).toBeVisible()
  await snap(zero, 'staff-dashboard', 'empty-my-open-actions')
  await zero.context().close()

  const admin = await session(browser, ADMIN)
  await admin.goto('/dashboard')
  await expect(admin.getByRole('region', { name: 'User Accounts' })).toBeVisible()
  await snap(admin, 'staff-dashboard', 'admin-with-user-accounts')
  await admin.context().close()

  // Forbidden: /dashboard renders by role, so a Requester following a staff
  // drill-down link gets the full-page forbidden state...
  const requester = await session(browser, REQUESTERS.jennifer.email)
  await requester.goto('/staff/tickets?ownerId=unassigned&statusGroup=active')
  await forbidden(requester)
  await snap(requester, 'staff-dashboard', 'forbidden-requester-on-staff-drilldown')
  // ...and calling the staff dashboard API directly returns 403 with no metric.
  await requester.goto('/api/dashboard/staff')
  await expect(requester.getByText('"FORBIDDEN"')).toBeVisible()
  await snap(requester, 'staff-dashboard', 'forbidden-requester-api-403', ['desktop'])
  await requester.context().close()
})

test('requester-dashboard: seeded states', async ({ browser }) => {
  const page = await session(browser, REQUESTERS.jennifer.email)
  await page.goto('/dashboard')
  await h1(page, 'Dashboard')
  await expect(page.getByRole('region', { name: 'Recently Updated' })).toBeVisible()
  await snap(page, 'requester-dashboard', 'with-data')

  // Attention required: Waiting for You opens My Tickets filtered to the
  // Tickets waiting on the Requester's reply.
  await page.getByRole('link', { name: /^Waiting for You: \d+\. View tickets$/ }).click()
  await expect(page).toHaveURL(/\/tickets\?status=WAITING_FOR_REQUESTER/)
  await h1(page, 'My Tickets')
  await expect(page.locator('#my-tickets-status')).toHaveValue('WAITING_FOR_REQUESTER')
  await snap(page, 'requester-dashboard', 'attention-waiting-for-you')

  await page.goto('/dashboard')
  await page.getByRole('link', { name: /^Open Tickets: \d+\. View tickets$/ }).click()
  await expect(page).toHaveURL(/\/tickets\?statusGroup=active/)
  await expect(page.getByRole('button', { name: /^Remove filter:/ }).first()).toBeVisible()
  await snap(page, 'requester-dashboard', 'drilldown-open-tickets')
  await page.context().close()

  const zeroCards = await session(browser, REQUESTERS.michael.email)
  await zeroCards.goto('/dashboard')
  await expect(zeroCards.getByText('Nothing needs your reply.')).toBeVisible()
  await snap(zeroCards, 'requester-dashboard', 'zero-metric-cards')
  await zeroCards.context().close()

  const empty = await session(browser, REQUESTERS.emma.email)
  await empty.goto('/dashboard')
  await expect(empty.getByText("You haven't submitted any tickets yet.")).toBeVisible()
  await snap(empty, 'requester-dashboard', 'zero-data-empty-state')
  await empty.context().close()

  // IT Staff on the Requester dashboard: /dashboard shows them the staff
  // view, a Requester drill-down URL is forbidden, and the API refuses.
  const staff = await session(browser, SARAH)
  await staff.goto('/tickets?statusGroup=active')
  await forbidden(staff)
  await snap(staff, 'requester-dashboard', 'forbidden-staff-on-requester-drilldown')
  await staff.goto('/api/dashboard/requester')
  await expect(staff.getByText('"FORBIDDEN"')).toBeVisible()
  await snap(staff, 'requester-dashboard', 'forbidden-staff-api-403', ['desktop'])
  await staff.context().close()
})

test('actions-taken and workflow: seeded Tickets, read only', async ({ browser }) => {
  const page = await session(browser, SARAH)
  const battery = await ticketIdByNumber(page, 'TKT-2026-900023')
  const vpn = await ticketIdByNumber(page, 'TKT-2026-900024')
  const resolved = await ticketIdByNumber(page, 'TKT-2026-900027')
  const cancelled = await ticketIdByNumber(page, 'TKT-2026-900008')

  // Four Actions on one Ticket, performed by four different staff members.
  await openStaffTicket(page, battery)
  await expect(actionsArea(page).getByTestId('action-row')).toHaveCount(4)
  await snap(page, 'actions-taken', 'multiple-actions-different-staff')

  // The status control and gate callout on that In Progress Ticket.
  await expect(page.getByTestId('resolution-gate-callout')).toBeVisible()
  await expandStatusOptions(page)
  await snap(page, 'workflow', 'status-options-in-progress-resolve-blocked')

  // Create mode, then the follow-up note rule (BR-06).
  await openStaffTicket(page, battery)
  await actionsArea(page).getByRole('button', { name: 'Add Action' }).click()
  const form = actionsArea(page).locator('form')
  await expect(form.getByRole('heading', { name: 'New Action' })).toBeFocused()
  await snap(page, 'actions-taken', 'create-mode')
  await form.getByLabel(/action description/i).fill('Check the charger output with a meter.')
  await form.getByRole('checkbox', { name: 'Follow-Up Required?' }).check()
  await form.getByRole('button', { name: 'Save Action' }).click()
  await expect(form.locator('.zg-error-message').first()).toBeVisible()
  await snap(page, 'actions-taken', 'follow-up-note-required-error')
  await form.getByRole('button', { name: 'Cancel' }).click()

  // Edit mode on an In Progress Action (nothing is saved).
  await actionRow(page, 'Order a replacement battery')
    .getByRole('button', { name: /^Edit/ })
    .click()
  await expect(
    actionsArea(page).locator('form').getByRole('heading', { name: 'Edit Action' }),
  ).toBeFocused()
  await snap(page, 'actions-taken', 'edit-mode-in-progress')

  // A Done Action: only the follow-up and attachment notes stay editable.
  await openStaffTicket(page, vpn)
  await actionRow(page, 'Replaced the VPN profile')
    .getByRole('button', { name: /^Edit follow-up/ })
    .click()
  await expect(
    actionsArea(page).locator('form').getByRole('heading', { name: 'Edit Action' }),
  ).toBeFocused()
  await snap(page, 'actions-taken', 'edit-mode-done-locked-fields')

  // An open Action still assigned to the deactivated Linda Park.
  await openStaffTicket(page, vpn)
  await expect(actionRow(page, 'home router firmware')).toContainText('Inactive')
  await snap(page, 'actions-taken', 'inactive-assignee-badge')

  await openStaffTicket(page, resolved)
  await expandStatusOptions(page)
  await snap(page, 'workflow', 'status-options-resolved')

  await openStaffTicket(page, cancelled)
  await snap(page, 'workflow', 'status-cancelled-final')
  await page.context().close()

  const admin = await session(browser, ADMIN)
  await openStaffTicket(admin, battery)
  await expandStatusOptions(admin)
  await snap(admin, 'workflow', 'status-options-admin-in-progress')
  await admin.context().close()

  // The Requester (David Chen) sees every Action field, read-only.
  const david = await session(browser, DAVID)
  await david.goto(`/tickets/${battery}`)
  await expect(actionsArea(david).getByTestId('action-row')).toHaveCount(4)
  await expect(actionsArea(david).getByRole('button', { name: /edit|add action/i })).toHaveCount(0)
  await david.waitForLoadState('networkidle')
  await snap(david, 'actions-taken', 'requester-read-only')
  await david.context().close()
})

test('regression: seeded screens', async ({ browser }) => {
  const anon = await session(browser)
  await anon.goto('/login')
  await expect(anon.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  await snap(anon, 'regression', 'login', ['desktop'])
  await anon.context().close()

  const siriporn = await session(browser, REQUESTERS.siriporn.email)
  await siriporn.goto('/tickets')
  await siriporn.waitForURL('**/change-password')
  await expect(siriporn.getByRole('heading', { name: 'Change Your Password' })).toBeVisible()
  await snap(siriporn, 'regression', 'change-password', ['desktop'])
  await siriporn.context().close()

  const jennifer = await session(browser, REQUESTERS.jennifer.email)
  await jennifer.goto('/tickets')
  await h1(jennifer, 'My Tickets')
  await expect(jennifer.getByText(/^Showing \d+ to \d+ of \d+ tickets$/)).toBeVisible()
  await snap(jennifer, 'regression', 'my-tickets', ['desktop'])
  await jennifer.goto('/tickets/new')
  await h1(jennifer, 'Create Ticket')
  await jennifer.waitForFunction(() => document.querySelectorAll('#category option').length > 1)
  await snap(jennifer, 'regression', 'create-ticket', ['desktop'])
  await jennifer.context().close()

  const staff = await session(browser, SARAH)
  await staff.goto('/staff/tickets')
  await h1(staff, 'Ticket Queue')
  await expect(staff.getByText(/^Showing \d+ to \d+ of \d+ tickets$/)).toBeVisible()
  await snap(staff, 'regression', 'ticket-queue', ['desktop'])
  await staff.context().close()

  const admin = await session(browser, ADMIN)
  await admin.goto('/admin/users')
  await h1(admin, 'User Management')
  await admin.waitForLoadState('networkidle')
  await snap(admin, 'regression', 'admin-user-management', ['desktop'])
  await admin.context().close()
})

// ---------------------------------------------------------------------------
// Fixture Tickets and users (removed by cleanFixtures afterwards).
// ---------------------------------------------------------------------------

test('actions-taken: conflict, rejections, and the Resolve gate', async ({ browser }) => {
  const page = await session(browser, REQUESTERS.jennifer.email)
  const ticket = await createTicketViaApi(page.request, {
    summary: 'Docking station drops both monitors',
    description: 'Both external monitors go blank every hour while the laptop is docked.',
  })
  await loginViaApi(page.request, SARAH)
  const detail = async () =>
    (await (await page.request.get(`/api/staff/tickets/${ticket.id}`)).json()) as {
      version: number
    }
  for (const status of ['OPEN', 'IN_PROGRESS']) {
    const res = await page.request.patch(`/api/staff/tickets/${ticket.id}/status`, {
      data: { status, version: (await detail()).version },
    })
    expect(res.ok()).toBe(true)
  }
  await page.request.patch(`/api/staff/tickets/${ticket.id}/claim`, {
    data: { version: (await detail()).version },
  })
  const createAction = async (data: Record<string, unknown>) => {
    const res = await page.request.post(`/api/staff/tickets/${ticket.id}/actions`, {
      data: { actionAt: new Date().toISOString(), ...data },
    })
    expect(res.ok()).toBe(true)
    return (await res.json()) as { id: number; version: number }
  }
  await createAction({
    description: 'Swapped the USB-C dock for a known-good unit.',
    status: 'DONE',
    result: 'Both monitors stayed connected for an hour.',
  })
  const planned = await createAction({ description: 'Update the dock firmware to 2.4.' })

  // Resolve blocked by the Planned Action.
  await openStaffTicket(page, ticket.id)
  await expect(page.getByTestId('resolution-gate-callout')).toBeVisible()
  await snap(page, 'actions-taken', 'resolve-blocked-open-action')

  // Done needs a Result (BR-08).
  await actionRow(page, 'dock firmware').getByRole('button', { name: /^Edit/ }).click()
  let form = actionsArea(page).locator('form')
  await form.getByLabel(/^status/i).selectOption('DONE')
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await expect(form.getByText('Enter the result before marking the action Done.')).toBeVisible()
  await snap(page, 'actions-taken', 'status-done-requires-result')

  // 409 STALE_UPDATE: a colleague saves the same Action first.
  await form.getByLabel(/^result/i).fill('Firmware 2.4 installed and verified.')
  await loginViaApi(page.request, AHMED)
  const colleague = await page.request.patch(
    `/api/staff/tickets/${ticket.id}/actions/${planned.id}`,
    { data: { status: 'IN_PROGRESS', version: planned.version } },
  )
  expect(colleague.ok()).toBe(true)
  await loginViaApi(page.request, SARAH)
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await expect(actionsArea(page).getByTestId('action-conflict')).toBeVisible()
  await snap(page, 'actions-taken', 'conflict-409-stale-update')

  // Reload latest, then finish the Action: the gate passes without a reload.
  await actionsArea(page)
    .getByTestId('action-conflict')
    .getByRole('button', { name: 'Reload latest' })
    .click()
  form = actionsArea(page).locator('form')
  await form.getByLabel(/^status/i).selectOption('DONE')
  await form.getByLabel(/^result/i).fill('Firmware 2.4 installed and verified.')
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByTestId('resolution-gate-callout')).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Resolved', exact: true })).toBeEnabled()
  await expandStatusOptions(page)
  await snap(page, 'actions-taken', 'resolve-available-gate-met')

  // Cancelling an Action asks for confirmation first (Cancelled is final).
  await openStaffTicket(page, ticket.id)
  const extra = await createAction({ description: 'Order a spare dock for the desk.' })
  expect(extra.id).toBeGreaterThan(0)
  await openStaffTicket(page, ticket.id)
  await actionRow(page, 'spare dock').getByRole('button', { name: /^Edit/ }).click()
  form = actionsArea(page).locator('form')
  await form.getByLabel(/^status/i).selectOption('CANCELLED')
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await expect(form.getByRole('button', { name: 'Cancel action' })).toBeVisible()
  await snap(page, 'actions-taken', 'status-cancel-confirmation')
  await form.getByRole('button', { name: 'Cancel action' }).click()
  await expect(actionRow(page, 'spare dock')).toContainText('Cancelled')
  await snap(page, 'actions-taken', 'status-cancelled-action')

  // Inactive assignee rejected by the server: the picker was loaded while
  // the fixture staff member was active, then an Administrator deactivated
  // them before the save.
  await loginViaApi(page.request, ADMIN)
  const created = await page.request.post('/api/admin/users', {
    data: {
      name: 'Pat Fixture',
      email: `pat.fixture.${STAMP}@shots.test.invalid`,
      role: 'IT_STAFF',
      isActive: true,
      initialPassword: 'FixturePass123!',
    },
  })
  expect(created.ok()).toBe(true)
  const fixtureUser = (await created.json()) as { id: number }
  await loginViaApi(page.request, SARAH)
  await openStaffTicket(page, ticket.id)
  await actionsArea(page).getByRole('button', { name: 'Add Action' }).click()
  form = actionsArea(page).locator('form')
  await form.getByLabel(/action description/i).fill('Hand the spare dock to the requester.')
  await form.getByLabel(/assigned to/i).selectOption({ label: 'Pat Fixture' })
  await loginViaApi(page.request, ADMIN)
  const deactivated = await page.request.patch(`/api/admin/users/${fixtureUser.id}`, {
    data: { isActive: false },
  })
  expect(deactivated.ok()).toBe(true)
  await loginViaApi(page.request, SARAH)
  await form.getByRole('button', { name: 'Save Action' }).click()
  await expect(form.locator('.zg-error-message').first()).toBeVisible()
  await snap(page, 'actions-taken', 'inactive-assignee-rejected')
  await page.context().close()
})

test('workflow and regression: fixture Tickets', async ({ browser }) => {
  const page = await session(browser, REQUESTERS.jennifer.email)
  const ticket = await createTicketViaApi(page.request, {
    summary: 'Shared drive does not map at login',
    description: 'The S: drive is missing after every sign-in; mapping it by hand works.',
  })
  // Attachments for the Ticket Detail regression shot (Lab 2).
  for (const file of ['valid-photo.png', 'valid-report.pdf']) {
    const res = await page.request.post(`/api/tickets/${ticket.id}/attachments`, {
      multipart: {
        file: {
          name: file,
          mimeType: file.endsWith('.png') ? 'image/png' : 'application/pdf',
          buffer: fs.readFileSync(path.join(__dirname, '../lab-02/fixtures', file)),
        },
      },
    })
    expect(res.ok(), await res.text()).toBe(true)
  }

  // New Ticket: the permitted transitions from New.
  await loginViaApi(page.request, SARAH)
  await openStaffTicket(page, ticket.id)
  await expandStatusOptions(page)
  await snap(page, 'workflow', 'status-options-new')

  // Public Comment vs Internal Note (Lab 3).
  await page.getByLabel(/add a comment/i).fill('We are checking the drive mapping script now.')
  await page.getByRole('button', { name: 'Post Comment' }).click()
  await expect(page.getByText('We are checking the drive mapping script now.')).toBeVisible()
  await page.getByLabel(/add an internal note/i).fill('Group policy cache is stale on this PC.')
  await page.getByRole('button', { name: 'Post Internal Note' }).click()
  await expect(page.getByText('Group policy cache is stale on this PC.')).toBeVisible()

  // Several status changes through the UI, then a Done Action and Resolve.
  const status = page.getByLabel(/current status/i)
  const badge = page.getByTestId('status-badge')
  for (const [value, label] of [
    ['OPEN', 'Open'],
    ['IN_PROGRESS', 'In Progress'],
    ['WAITING_FOR_REQUESTER', 'Waiting for Requester'],
    ['IN_PROGRESS', 'In Progress'],
  ]) {
    await status.selectOption(value!)
    await expect(badge).toHaveText(label!)
  }
  const done = await page.request.post(`/api/staff/tickets/${ticket.id}/actions`, {
    data: {
      actionAt: new Date().toISOString(),
      description: 'Cleared the group policy cache and re-ran the mapping script.',
      status: 'DONE',
      result: 'The S: drive maps at login.',
    },
  })
  expect(done.ok()).toBe(true)
  await openStaffTicket(page, ticket.id)
  await page.getByRole('heading', { name: 'Public Comments' }).scrollIntoViewIfNeeded()
  await snap(page, 'regression', 'staff-public-comments-vs-internal-notes', ['desktop'])

  // A server-side gate rejection: the page loaded with the gate met, then a
  // colleague added a Planned Action before Resolved was submitted.
  await expect(page.getByRole('option', { name: 'Resolved', exact: true })).toBeEnabled()
  await loginViaApi(page.request, AHMED)
  const late = await page.request.post(`/api/staff/tickets/${ticket.id}/actions`, {
    data: { actionAt: new Date().toISOString(), description: 'Check the other lab PCs too.' },
  })
  expect(late.ok()).toBe(true)
  const lateAction = (await late.json()) as { id: number; version: number }
  await loginViaApi(page.request, SARAH)
  await status.selectOption('RESOLVED')
  await expect(page.getByTestId('resolution-gate-callout')).toBeVisible()
  await expect(page.locator('.zg-error-message[role="alert"]').first()).toBeVisible()
  await snap(page, 'workflow', 'resolution-gate-error-409')

  // Cancel the late Action, then resolve, close, and reopen.
  const cancelled = await page.request.patch(
    `/api/staff/tickets/${ticket.id}/actions/${lateAction.id}`,
    { data: { status: 'CANCELLED', version: lateAction.version } },
  )
  expect(cancelled.ok()).toBe(true)
  await openStaffTicket(page, ticket.id)
  await status.selectOption('RESOLVED')
  await expect(badge).toHaveText('Resolved')
  await status.selectOption('CLOSED')
  await expect(badge).toHaveText('Closed')
  await status.selectOption('REOPENED')
  await expect(badge).toHaveText('Reopened')
  await page.getByRole('heading', { name: 'Status History' }).scrollIntoViewIfNeeded()
  await snap(page, 'workflow', 'status-history-staff')

  // The Requester: no status control, the same history, the advisory action.
  await loginViaApi(page.request, REQUESTERS.jennifer.email)
  await page.goto(`/tickets/${ticket.id}`)
  await expect(page.getByRole('heading', { name: 'Status History' })).toBeVisible()
  await expect(page.getByText('valid-report.pdf')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await snap(page, 'regression', 'requester-ticket-detail-attachments', ['desktop'])
  await snap(page, 'workflow', 'status-history-requester')

  await page.getByRole('button', { name: 'Problem Appears Resolved' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await snap(page, 'workflow', 'requester-advisory-confirm')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  await snap(page, 'workflow', 'requester-advisory-recorded-status-unchanged')

  // Staff see the advisory note; Current Status is still Reopened.
  await loginViaApi(page.request, SARAH)
  await openStaffTicket(page, ticket.id)
  await expect(badge).toHaveText('Reopened')
  await expect(page.getByText(/Requester confirms resolved/)).toBeVisible()
  await snap(page, 'workflow', 'requester-advisory-staff-view')
  await page.context().close()
})
