import { expect, test, type Page } from '@playwright/test'
import {
  createTicketViaApi,
  loginViaApi,
  loginViaUi,
  REQUESTERS,
  SEED_PASSWORD,
  VIEWPORTS,
} from '../lab-02/helpers'

// E2E-08, E2E-09, E2E-10, E2E-11, STYLE-01 — AC-02, AC-26, AC-28, AC-30, AC-31,
// AC-33, AC-36, AC-41: docs/lab-04 ui-spec.md §1, §3, §4, §10. Both
// dashboards against the seeded database. Expected numbers come from
// GET /api/dashboard/{staff,requester} in the same session, never hardcoded.

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

// E2E-10 (AC-26, BR-29): Issue #70 completes the row. From the dashboard,
// the Administrator works a Ticket in the Queue exactly as IT Staff would.
test('E2E-10: an Administrator uses the Queue, claims, changes status, notes, and records an Action', async ({
  page,
}) => {
  await loginViaApi(page.request, REQUESTERS.jennifer.email)
  const ticket = await createTicketViaApi(page.request, { summary: `Admin parity ${Date.now()}` })
  await loginViaUi(page, ADMIN, SEED_PASSWORD, '**/dashboard')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Ticket Queue' })
    .click()
  await page.getByPlaceholder(/search by ticket number or summary/i).fill(ticket.ticketNumber)
  await page.getByRole('link', { name: ticket.ticketNumber }).click()

  await page.getByRole('button', { name: 'Claim' }).click()
  await expect(page.getByLabel(/ticket owner/i).locator('option:checked')).toHaveText(/Alex Morgan/)
  await page.getByLabel(/current status/i).selectOption('OPEN')
  await expect(page.getByTestId('status-badge')).toHaveText('Open')
  const note = `Administrator note ${Date.now()}`
  await page.getByLabel(/add an internal note/i).fill(note)
  await page.getByRole('button', { name: 'Post Internal Note' }).click()
  await expect(page.getByText(note)).toBeVisible()

  const area = page.locator('#actions-taken')
  await area.getByRole('button', { name: 'Add Action' }).click()
  await area
    .locator('form')
    .getByLabel(/action description/i)
    .fill('Administrator checked the dock.')
  await area.locator('form').getByRole('button', { name: 'Save Action' }).click()
  await expect(area.getByTestId('action-row')).toHaveCount(1)
  await expect(area.getByTestId('action-row')).toContainText('Alex Morgan')
})

type TicketItem = { id: number; ticketNumber: string }
type RequesterDashboard = {
  hasAnyTickets: boolean
  metrics: Record<string, Metric>
  recentlyUpdated: TicketItem[]
  recentlyResolved: TicketItem[]
}

// ui-spec.md §3 card order and labels (specification.md BR-39, BR-41, BR-42).
const REQUESTER_CARDS: [key: string, label: string][] = [
  ['openTickets', 'Open Tickets'],
  ['waitingForYou', 'Waiting for You'],
  ['resolvedLast30Days', 'Resolved (Last 30 Days)'],
]

async function fetchRequesterDashboard(page: Page): Promise<RequesterDashboard> {
  const res = await page.request.get('/api/dashboard/requester')
  expect(res.ok()).toBe(true)
  return res.json()
}

// Every Ticket Number the signed-in Requester owns, read through the API.
async function ownTicketNumbers(page: Page): Promise<string[]> {
  const numbers: string[] = []
  for (let p = 1; ; p++) {
    const res = await page.request.get(`/api/tickets?pageSize=50&page=${p}`)
    const body = (await res.json()) as { data: TicketItem[]; totalPages: number }
    numbers.push(...body.data.map((t) => t.ticketNumber))
    if (p >= body.totalPages) return numbers
  }
}

// My Tickets' total, from the same pagination line the Queue uses.
const myTicketsTotal = queueTotal

test.describe('Requester dashboard', () => {
  test('E2E-09: every card matches the API, and each drill-down list matches its card', async ({
    page,
  }) => {
    // E2E-11 / AC-36: login lands on the Dashboard, marked as the current page.
    await loginViaUi(page, REQUESTERS.jennifer.email)
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText(`Welcome back, ${REQUESTERS.jennifer.name}.`)).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('aria-current', 'page')

    const data = await fetchRequesterDashboard(page)
    expect(data.hasAnyTickets).toBe(true)
    expect(data.metrics.openTickets!.value).toBeGreaterThan(0)

    for (const [key, label] of REQUESTER_CARDS) {
      const metric = data.metrics[key]!
      await card(page, label, metric.value).click()
      await expect(page).toHaveURL(metric.drillDown)
      await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
      // ui-spec.md §2.5: the filter shows as a chip or in the Status control.
      if (key === 'waitingForYou') {
        await expect(page.getByLabel('Current Status')).toHaveValue('WAITING_FOR_REQUESTER')
      } else {
        await expect(page.getByRole('button', { name: /^Remove filter:/ })).toBeVisible()
      }
      // BR-38: the list total equals the card.
      expect(await myTicketsTotal(page)).toBe(metric.value)
      await page.goBack()
      await expect(card(page, label, metric.value)).toBeVisible()
    }

    // Each list row opens that Ticket's detail.
    const recent = data.recentlyUpdated[0]!
    await page
      .getByRole('region', { name: 'Recently Updated' })
      .getByRole('link', { name: recent.ticketNumber, exact: true })
      .click()
    await expect(page).toHaveURL(`/tickets/${recent.id}`)
    await page.goBack()
    const resolved = data.recentlyResolved[0]!
    await page
      .getByRole('region', { name: 'Recently Resolved' })
      .getByRole('link', { name: resolved.ticketNumber, exact: true })
      .click()
    await expect(page).toHaveURL(`/tickets/${resolved.id}`)
  })

  test('E2E-09: a Ticket waiting for the Requester opens where they can reply', async ({
    page,
  }) => {
    await loginViaUi(page, REQUESTERS.jennifer.email)
    const data = await fetchRequesterDashboard(page)
    const waiting = data.metrics.waitingForYou!
    expect(waiting.value).toBeGreaterThan(0)

    const waitingCard = card(page, 'Waiting for You', waiting.value)
    await expect(waitingCard).toHaveClass(/is-attention/)
    await waitingCard.click()
    await page.getByRole('table').getByRole('link').first().click()
    await expect(page).toHaveURL(/\/tickets\/\d+$/)
    await expect(page.getByText('Waiting for Requester').first()).toBeVisible()
    await expect(page.getByText('Public Comments')).toBeVisible()
  })

  test('E2E-09: Create Ticket opens from the dashboard and View all opens My Tickets', async ({
    page,
  }) => {
    await loginViaUi(page, REQUESTERS.jennifer.email)
    await page.getByRole('main').getByRole('link', { name: 'Create Ticket' }).click()
    await expect(page).toHaveURL('/tickets/new')
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Create Ticket' }),
    ).toHaveAttribute('aria-current', 'page')

    await page.goBack()
    await page.getByRole('link', { name: /view all my tickets/i }).click()
    await expect(page).toHaveURL('/tickets?sortBy=updatedAt&sortDir=desc')
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My Tickets' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  test('E2E-09 / AC-31: a Requester with no Tickets sees the empty state', async ({ page }) => {
    await loginViaUi(page, REQUESTERS.emma.email)
    const data = await fetchRequesterDashboard(page)
    expect(data.hasAnyTickets).toBe(false)
    for (const metric of Object.values(data.metrics)) expect(metric.value).toBe(0)

    const empty = page.getByRole('region', { name: "You haven't submitted any tickets yet." })
    await expect(empty).toBeVisible()
    await expect(page.getByRole('region', { name: 'Metrics' })).toHaveCount(0)
    await empty.getByRole('link', { name: 'Create Ticket' }).click()
    await expect(page).toHaveURL('/tickets/new')
  })

  test("AC-02: a second Requester never sees the first one's Tickets", async ({ page }) => {
    await loginViaApi(page.request, REQUESTERS.jennifer.email)
    const jennifer = (await (await page.request.get('/api/auth/me')).json()) as { id: number }
    const jenniferTickets = await ownTicketNumbers(page)
    expect(jenniferTickets.length).toBeGreaterThan(0)
    await page.request.post('/api/auth/logout')

    await loginViaUi(page, REQUESTERS.michael.email)
    const data = await fetchRequesterDashboard(page)
    const michaelTickets = await ownTicketNumbers(page)
    for (const [key, label] of REQUESTER_CARDS) {
      await expect(card(page, label, data.metrics[key]!.value)).toBeVisible()
    }
    await expect(page.getByRole('region', { name: 'Recently Updated' })).toBeVisible()

    const visibleTicketNumbers = async () =>
      (await page.getByRole('main').textContent())!.match(/TKT-\d{4}-\d{6}/g) ?? []

    for (const number of await visibleTicketNumbers()) expect(michaelTickets).toContain(number)

    // A hand-edited drill-down cannot widen the scope.
    for (const url of [
      `/tickets?statusGroup=active&requesterId=${jennifer.id}`,
      `/tickets?sortBy=updatedAt&sortDir=desc&requesterId=${jennifer.id}`,
    ]) {
      await page.goto(url)
      await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
      await myTicketsTotal(page)
      for (const number of await visibleTicketNumbers()) {
        expect(jenniferTickets).not.toContain(number)
      }
    }
    expect(
      (await page.request.get(`/api/dashboard/requester?requesterId=${jennifer.id}`)).ok(),
    ).toBe(true)
    expect(await fetchRequesterDashboard(page)).toMatchObject({ metrics: data.metrics })
  })

  test('IT Staff opening /dashboard gets the staff dashboard, and the API refuses the Requester one', async ({
    page,
  }) => {
    await loginViaUi(page, STAFF, SEED_PASSWORD, '**/dashboard')
    await page.goto('/dashboard')
    await expect(page.getByText(/operational overview/i)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Recently Resolved' })).toHaveCount(0)
    // The API stays the authority (AC-32).
    expect((await page.request.get('/api/dashboard/requester')).status()).toBe(403)
  })
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

// STYLE-01 (ui-spec.md §3, §10): one card row and two list columns on
// desktop, wrapping at tablet, a single column on mobile, no horizontal scroll.
test.describe('STYLE-01: requester dashboard responsive layout', () => {
  const layout = {
    desktop: { cards: 3, lists: 2 },
    tablet: { cards: 2, lists: 1 },
    mobile: { cards: 1, lists: 1 },
  }
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await loginViaUi(page, REQUESTERS.jennifer.email)
      await expect(page.getByRole('region', { name: 'Recently Resolved' })).toBeVisible()

      const tracks = (selector: string) =>
        page
          .locator(selector)
          .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      const expected = layout[name as keyof typeof layout]
      expect(await tracks('.zg-metric-grid')).toBe(expected.cards)
      expect(await tracks('.zg-dashboard-lists')).toBe(expected.lists)
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1)
      // No clipped card labels: each label fits its own box.
      for (const label of await page.locator('.zg-metric-card .zg-label').all()) {
        expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
      }
    })
  }
})
