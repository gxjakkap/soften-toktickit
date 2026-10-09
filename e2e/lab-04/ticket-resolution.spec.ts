import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  createTicketViaApi,
  loginViaApi,
  loginViaUi,
  REQUESTERS,
  SEED_PASSWORD,
} from '../lab-02/helpers'

// E2E-03..E2E-07 (AC-16, AC-19, AC-20, AC-23, AC-25, AC-27): docs/lab-04
// ui-spec.md §5.1, §5.3, §6 and specification.md BR-16..BR-22. Fixture
// Tickets are filed by a seeded Requester, and their Actions Taken are
// recorded through the Actions Taken API, not the #65 UI. The seeded
// battery Ticket is only read.

const STAFF = 'sarah.johnson@example.com'
const OTHER_STAFF = 'ahmed.hassan@example.com'

// Records an Action through the Actions Taken API (#63) as IT Staff.
async function addAction(request: APIRequestContext, ticketId: number, status: 'DONE' | 'PLANNED') {
  await loginViaApi(request, STAFF)
  const res = await request.post(`/api/staff/tickets/${ticketId}/actions`, {
    data: {
      actionAt: new Date().toISOString(),
      description: status === 'DONE' ? 'Replaced the faulty part.' : 'Schedule a follow-up visit.',
      ...(status === 'DONE' ? { status, result: 'Verified working with the requester.' } : {}),
    },
  })
  if (!res.ok()) throw new Error(`addAction failed: ${res.status()} ${await res.text()}`)
}

async function fileTicket(request: APIRequestContext, label: string) {
  await loginViaApi(request, REQUESTERS.jennifer.email)
  return createTicketViaApi(request, { summary: `${label} ${Date.now()}` })
}

const statusSelect = (page: Page) => page.getByLabel(/current status/i)
const badge = (page: Page) => page.getByTestId('status-badge')
const history = (page: Page) => page.getByTestId('status-history').getByRole('listitem')

async function changeStatus(page: Page, status: string, label: string) {
  await statusSelect(page).selectOption(status)
  await expect(badge(page)).toHaveText(label)
  await expect(statusSelect(page)).toBeEnabled()
}

test('E2E-03: a Ticket with a Done Action is worked through to Resolved, then Closed', async ({
  page,
  request,
}) => {
  const ticket = await fileTicket(request, 'Resolution happy path')
  await addAction(request, ticket.id, 'DONE')

  await loginViaUi(page, STAFF, SEED_PASSWORD, '**/staff/tickets')
  await page.goto(`/staff/tickets/${ticket.id}`)
  await expect(history(page)).toHaveCount(1)
  await expect(history(page).first()).toContainText('Created as')

  await changeStatus(page, 'IN_PROGRESS', 'In Progress')
  await expect(page.getByRole('option', { name: 'Resolved', exact: true })).toBeEnabled()
  await expect(page.getByTestId('resolution-gate-callout')).toHaveCount(0)

  // AC-19/AC-27: badge, select, and history update without a page reload.
  await changeStatus(page, 'RESOLVED', 'Resolved')
  await expect(history(page)).toHaveCount(3)
  await expect(history(page).last()).toContainText('In Progress')
  await expect(history(page).last()).toContainText('Resolved')
  await expect(history(page).last()).toContainText('Sarah Johnson')

  await changeStatus(page, 'CLOSED', 'Closed')
  await expect(history(page)).toHaveCount(4)
  await expect(statusSelect(page).getByRole('option')).toHaveText(['Closed', 'Reopened'])

  // The Requester sees the same history, read-only.
  await loginViaUi(page, REQUESTERS.jennifer.email)
  await page.goto(`/tickets/${ticket.id}`)
  await expect(history(page)).toHaveCount(4)
  await expect(page.getByRole('combobox')).toHaveCount(0)
})

test('E2E-03/E2E-04: a Ticket without qualifying Actions is blocked at Resolved, in the UI and by direct API call', async ({
  page,
  request,
}) => {
  const ticket = await fileTicket(request, 'Resolution blocked')

  await loginViaUi(page, STAFF, SEED_PASSWORD, '**/staff/tickets')
  await page.goto(`/staff/tickets/${ticket.id}`)
  await changeStatus(page, 'IN_PROGRESS', 'In Progress')

  await expect(page.getByRole('option', { name: 'Resolved (blocked)' })).toBeDisabled()
  const callout = page.getByTestId('resolution-gate-callout')
  await expect(callout).toContainText('Record at least one action as Done.')

  // E2E-04: bypass the UI with the current version; the server still refuses.
  const detail = await (await page.request.get(`/api/staff/tickets/${ticket.id}`)).json()
  const res = await page.request.patch(`/api/staff/tickets/${ticket.id}/status`, {
    data: { status: 'RESOLVED', version: detail.version },
  })
  expect(res.status()).toBe(409)
  const body = await res.json()
  expect(body.error.code).toBe('RESOLUTION_BLOCKED')
  expect(body.error.details.reasons).toEqual(['NO_DONE_ACTION'])

  await page.reload()
  await expect(badge(page)).toHaveText('In Progress')
})

test('E2E-03: a seeded Ticket with open Actions shows Resolved as blocked', async ({ page }) => {
  await loginViaUi(page, STAFF, SEED_PASSWORD, '**/staff/tickets')
  const queue = await (
    await page.request.get('/api/staff/tickets?search=Laptop%20battery%20drains%20within')
  ).json()
  await page.goto(`/staff/tickets/${queue.data[0].id}`)

  await expect(page.getByRole('option', { name: 'Resolved (blocked)' })).toBeDisabled()
  await expect(page.getByTestId('resolution-gate-callout')).toContainText(
    'Finish or cancel every Planned or In Progress action.',
  )
})

test('E2E-05: the Requester "Problem Appears Resolved" action is advisory only', async ({
  page,
  request,
}) => {
  const ticket = await fileTicket(request, 'Advisory resolved')

  await loginViaUi(page, STAFF, SEED_PASSWORD, '**/staff/tickets')
  await page.goto(`/staff/tickets/${ticket.id}`)
  await changeStatus(page, 'IN_PROGRESS', 'In Progress')

  await loginViaUi(page, REQUESTERS.jennifer.email)
  await page.goto(`/tickets/${ticket.id}`)
  const button = page.getByRole('button', { name: 'Problem Appears Resolved' })
  await expect(button).toBeVisible()
  await expect(page.locator('#appears-resolved-hint')).toHaveText(
    'Lets IT Staff know it looks fixed. Only IT Staff can resolve the ticket.',
  )
  await button.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByTestId('resolved-badge')).toBeVisible()
  await expect(badge(page)).toHaveText('In Progress')

  await loginViaUi(page, STAFF, SEED_PASSWORD, '**/staff/tickets')
  await page.goto(`/staff/tickets/${ticket.id}`)
  await expect(page.getByText(/requester confirms resolved/i)).toBeVisible()
  await expect(badge(page)).toHaveText('In Progress')
  await expect(page.getByRole('option', { name: 'Resolved (blocked)' })).toBeDisabled()
})

test('E2E-06: a stale status change shows the conflict banner and Reload latest', async ({
  browser,
  request,
}) => {
  const ticket = await fileTicket(request, 'Stale status')
  const [first, second] = await Promise.all([browser.newPage(), browser.newPage()])
  try {
    await loginViaUi(first, STAFF, SEED_PASSWORD, '**/staff/tickets')
    await loginViaUi(second, OTHER_STAFF, SEED_PASSWORD, '**/staff/tickets')
    await first.goto(`/staff/tickets/${ticket.id}`)
    await second.goto(`/staff/tickets/${ticket.id}`)
    await expect(badge(second)).toHaveText('New')

    await changeStatus(first, 'OPEN', 'Open')

    await statusSelect(second).selectOption('CANCELLED')
    const banner = second.getByTestId('workflow-conflict')
    await expect(banner).toContainText('Someone else changed this ticket while you were editing.')
    await expect(banner).toContainText('status Open')
    await expect(statusSelect(second)).toHaveValue('NEW')

    await second.getByRole('button', { name: 'Reload latest' }).click()
    await expect(badge(second)).toHaveText('Open')
    await expect(banner).toHaveCount(0)
  } finally {
    await first.close()
    await second.close()
  }
})

test('E2E-07: Resolved -> Closed -> Reopened, then blocked again by a new Planned Action', async ({
  page,
  request,
}) => {
  const ticket = await fileTicket(request, 'Reopen')
  await addAction(request, ticket.id, 'DONE')

  await loginViaUi(page, STAFF, SEED_PASSWORD, '**/staff/tickets')
  await page.goto(`/staff/tickets/${ticket.id}`)
  await changeStatus(page, 'IN_PROGRESS', 'In Progress')
  await changeStatus(page, 'RESOLVED', 'Resolved')
  await changeStatus(page, 'CLOSED', 'Closed')
  await changeStatus(page, 'REOPENED', 'Reopened')
  await changeStatus(page, 'IN_PROGRESS', 'In Progress')

  await addAction(request, ticket.id, 'PLANNED')
  await page.reload()
  await expect(page.getByRole('option', { name: 'Resolved (blocked)' })).toBeDisabled()
  await expect(page.getByTestId('resolution-gate-callout')).toContainText(
    'Finish or cancel every Planned or In Progress action.',
  )
})
