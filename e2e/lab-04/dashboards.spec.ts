import { expect, test, type Page } from '@playwright/test'
import { loginViaUi, REQUESTERS, SEED_PASSWORD, VIEWPORTS } from '../lab-02/helpers'

// E2E-08, E2E-10, E2E-11, STYLE-01 (IT Staff part) — AC-28, AC-30, AC-33,
// AC-36, AC-41: docs/lab-04 ui-spec.md §1, §4, §10. The IT Staff and
// Administrator dashboards against the seeded database. Expected numbers
// come from GET /api/dashboard/staff in the same session, never hardcoded.
// Issue #68 adds the Requester dashboard (E2E-09).

const STAFF = 'sarah.johnson@example.com'
const ADMIN = 'alex.morgan@example.com'

type Metric = { value: number; drillDown: string; ticketCount?: number }
type StaffDashboard = {
  metrics: Record<string, Metric>
  myOpenActionList: { ticketId: number; drillDown: string; ticketNumber: string }[]
  recentlyUpdated: { id: number; ticketNumber: string }[]
  userAccounts?: Record<string, { active: number; inactive: number; drillDown: string }>
}

// ui-spec.md §4 card order and labels (specification.md BR-45..BR-50).
const CARDS: [key: string, label: string][] = [
  ['myOpenActions', 'My Open Actions'],
  ['myActiveTickets', 'My Active Tickets'],
  ['followUpsPending', 'Follow-Ups Pending'],
  ['unassigned', 'Unassigned'],
  ['highPriority', 'High Priority'],
  ['resolvedToday', 'Resolved Today'],
]

async function fetchDashboard(page: Page): Promise<StaffDashboard> {
  const res = await page.request.get('/api/dashboard/staff')
  expect(res.ok()).toBe(true)
  return res.json()
}

const card = (page: Page, label: string, value: number) =>
  page.getByRole('link', { name: `${label}: ${value}. View tickets`, exact: true })

// The Queue's total: "Showing 1 to 10 of N tickets", or 0 on the no-results state.
async function queueTotal(page: Page): Promise<number> {
  const showing = page.getByText(/^Showing \d+ to \d+ of \d+ tickets$/)
  const none = page.getByText('No tickets match your filters')
  await expect(showing.or(none)).toBeVisible()
  if (await none.isVisible()) return 0
  return Number((await showing.textContent())!.match(/of (\d+) tickets/)![1])
}

test.describe('IT Staff dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // E2E-11 / AC-36: login lands on the Dashboard, marked as the current page.
    await loginViaUi(page, STAFF, SEED_PASSWORD, '**/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  test('E2E-08: every card matches the API, and each drill-down list matches its card', async ({
    page,
  }) => {
    const data = await fetchDashboard(page)

    for (const [key, label] of CARDS) {
      const metric = data.metrics[key]!
      await card(page, label, metric.value).click()
      await expect(page).toHaveURL(metric.drillDown)
      await expect(page.getByRole('heading', { name: 'Ticket Queue' })).toBeVisible()
      // ui-spec.md §2.5: the drill-down filters are visible as chips.
      await expect(page.getByRole('button', { name: /^Remove filter:/ }).first()).toBeVisible()
      // BR-38: the list total equals the card, except BR-45 (Actions vs Tickets).
      const expected = key === 'myOpenActions' ? metric.ticketCount : metric.value
      expect(await queueTotal(page)).toBe(expected)
      await page.goBack()
      await expect(card(page, label, metric.value)).toBeVisible()
    }
  })

  test('E2E-08: a recent Ticket and a recent open Action open Ticket Detail', async ({ page }) => {
    const data = await fetchDashboard(page)
    expect(data.recentlyUpdated.length).toBeGreaterThan(0)
    expect(data.myOpenActionList.length).toBeGreaterThan(0)

    const recent = data.recentlyUpdated[0]!
    await page
      .getByRole('region', { name: 'Recently Updated' })
      .getByRole('link', { name: recent.ticketNumber, exact: true })
      .click()
    await expect(page).toHaveURL(`/staff/tickets/${recent.id}`)
    await expect(page.getByText(recent.ticketNumber, { exact: true }).first()).toBeVisible()

    await page.goBack()
    const action = data.myOpenActionList[0]!
    await page
      .getByRole('region', { name: 'My Open Actions' })
      .getByRole('link', { name: action.ticketNumber, exact: true })
      .first()
      .click()
    await expect(page).toHaveURL(action.drillDown)
    // ui-spec.md §4: Ticket Detail focuses the Actions Taken heading.
    await expect(page.getByRole('heading', { name: /^Actions Taken \(\d+\)$/ })).toBeFocused()
  })

  test('has no User Accounts section for IT Staff', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Metrics' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'User Accounts' })).toHaveCount(0)
  })
})

test('E2E-10: an Administrator lands on the dashboard with User Accounts and drills into User Management', async ({
  page,
}) => {
  await loginViaUi(page, ADMIN, SEED_PASSWORD, '**/dashboard')
  const data = await fetchDashboard(page)
  const accounts = page.getByRole('region', { name: 'User Accounts' })
  await expect(accounts).toBeVisible()

  const staff = data.userAccounts!.IT_STAFF!
  const link = accounts.getByRole('link', {
    name: `IT Staff: ${staff.active} active, ${staff.inactive} inactive. View users`,
  })
  await link.click()
  await expect(page).toHaveURL(staff.drillDown)
  await expect(page.getByRole('button', { name: 'Remove filter: Role: IT Staff' })).toBeVisible()
})

test('a Requester opening /dashboard is sent to My Tickets with no Dashboard item', async ({
  page,
}) => {
  await loginViaUi(page, REQUESTERS.jennifer.email)
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/tickets')
  await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }),
  ).toHaveCount(0)
  // The API stays the authority (AC-32).
  expect((await page.request.get('/api/dashboard/staff')).status()).toBe(403)
})

// STYLE-01 (ui-spec.md §10): 3/2/1 cards per row and no horizontal scroll.
// Screenshots for grading are captured in Issue #11's screenshots.spec.ts.
test.describe('STYLE-01: staff dashboard responsive layout', () => {
  const columns = { desktop: 3, tablet: 2, mobile: 1 }
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await loginViaUi(page, ADMIN, SEED_PASSWORD, '**/dashboard')
      await expect(page.getByRole('region', { name: 'User Accounts' })).toBeVisible()

      const grid = page.getByRole('region', { name: 'Metrics' }).getByRole('list')
      const tracks = await grid.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
      )
      expect(tracks).toBe(columns[name as keyof typeof columns])
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1)
    })
  }
})
