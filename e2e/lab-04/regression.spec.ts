// E2E-12, E2E-13 — AC-02, AC-14, AC-19, AC-37, AC-43.
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { loginViaApi, loginViaUi, REQUESTERS, waitForCreateTicketReady } from '../lab-02/helpers'

// E2E-12, E2E-13 (AC-37, AC-43, FR-23): docs/lab-04 specification.md §9 and
// the Lab 2/3 contracts. One journey crosses all three roles on the Lab 4
// schema and seed, through the real UI. The Ticket is filed by a seeded
// Requester and the staff user by the Administrator under .test.invalid, so
// e2e/clean-fixtures.ts removes both.

const PHOTO = path.join(__dirname, '../lab-02/fixtures/valid-photo.png')
const SARAH = { name: 'Sarah Johnson', email: 'sarah.johnson@example.com' }
const AHMED = { name: 'Ahmed Hassan', email: 'ahmed.hassan@example.com' }
const ADMIN = 'alex.morgan@example.com'
const TEMP_PASSWORD = 'Temp1234!'

type RequesterMetrics = Record<'openTickets' | 'resolvedLast30Days', { value: number }>

async function requesterMetrics(page: Page): Promise<RequesterMetrics> {
  const res = await page.request.get('/api/dashboard/requester')
  expect(res.ok()).toBe(true)
  return (await res.json()).metrics
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForURL('**/login')
}

const actionsArea = (page: Page) => page.locator('#actions-taken')

// Records a Done Action through the Actions Taken form (ui-spec.md §5.2).
async function addDoneAction(page: Page, description: string, result: string) {
  const area = actionsArea(page)
  const before = await area.getByTestId('action-row').count()
  await area.getByRole('button', { name: 'Add Action' }).click()
  const form = area.locator('form')
  await form.getByLabel(/action description/i).fill(description)
  await form.getByLabel(/^status/i).selectOption('DONE')
  await form.getByLabel(/^result/i).fill(result)
  await form.getByRole('button', { name: 'Save Action' }).click()
  await expect(area.getByTestId('action-row')).toHaveCount(before + 1)
}

test('E2E-12: one Ticket through Requester, two IT Staff, and the Administrator', async ({
  page,
}) => {
  const problems: string[] = []
  // The browser logs the expected 401 (/api/auth/me on the Login screen) and
  // 403 (the inactive login) as resource errors. Anything else, any page
  // error, and any 5xx fails the journey.
  page.on('console', (msg) => {
    const expected = /status of 40[13] \(/.test(msg.text())
    if ((msg.type() === 'error' || msg.type() === 'warning') && !expected) problems.push(msg.text())
  })
  page.on('pageerror', (err) => problems.push(err.message))
  page.on('response', (res) => {
    if (res.status() >= 500) problems.push(`${res.status()} ${res.url()}`)
  })

  const stamp = Date.now()
  const summary = `Regression journey ${stamp}`
  const comment = `We are replacing the dock now ${stamp}.`
  const note = `Vendor RMA opened, do not share ${stamp}.`
  const firstAction = `Swapped the USB-C dock ${stamp}.`
  const secondAction = `Updated the dock firmware ${stamp}.`

  // Lab 2: Create Ticket with an attachment, then find it with My Tickets search.
  await loginViaUi(page, REQUESTERS.jennifer.email)
  const before = await requesterMetrics(page)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Create Ticket' })
    .click()
  await waitForCreateTicketReady(page)
  await page.getByLabel('Category').selectOption({ index: 1 })
  await page.getByLabel('Related System').selectOption({ index: 1 })
  await page.getByLabel('Requested Priority').selectOption('MEDIUM')
  await page.getByLabel('Summary').fill(summary)
  await page.getByLabel('Description').fill('The docking station drops both monitors every hour.')
  await page.getByTestId('attachment-dropzone').click()
  await page.locator('#attachments').setInputFiles(PHOTO)
  await page.getByRole('button', { name: 'Submit' }).click()
  const banner = page.getByRole('status')
  await expect(banner).toContainText(/Ticket created: TKT-\d{4}-\d{6}/)
  const ticketNumber = (await banner.textContent())!.match(/TKT-\d{4}-\d{6}/)![0]
  await page.getByRole('link', { name: 'View Ticket' }).click()
  await expect(page.getByText('valid-photo.png')).toBeVisible()
  const ticketId = Number(page.url().match(/\/tickets\/(\d+)/)![1])
  await page.goto('/tickets')
  await page.getByLabel('Search').fill(summary)
  await expect(page.getByRole('link', { name: ticketNumber })).toBeVisible()
  await logout(page)

  // Lab 3 + Lab 4: IT Staff A finds it in the Queue, claims it, starts work,
  // posts a Public Comment and an Internal Note, and records a Done Action.
  await loginViaUi(page, SARAH.email)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Ticket Queue' })
    .click()
  await page.getByPlaceholder(/search by ticket number or summary/i).fill(ticketNumber)
  await page.getByRole('link', { name: ticketNumber }).click()
  await expect(page.getByRole('heading', { name: summary })).toBeVisible()
  await page.getByRole('button', { name: 'Claim' }).click()
  await expect(page.getByLabel(/ticket owner/i)).toHaveValue(/\d+/)
  await page.getByLabel(/current status/i).selectOption('IN_PROGRESS')
  await expect(page.getByTestId('status-badge')).toHaveText('In Progress')
  await page.getByLabel(/add a comment/i).fill(comment)
  await page.getByRole('button', { name: 'Post Comment' }).click()
  await expect(page.getByText(comment)).toBeVisible()
  await page.getByLabel(/add an internal note/i).fill(note)
  await page.getByRole('button', { name: 'Post Internal Note' }).click()
  await expect(page.getByText(note)).toBeVisible()
  await addDoneAction(page, firstAction, 'Monitors stayed connected for an hour.')
  await logout(page)

  // IT Staff B records the second Action and resolves the Ticket (BR-18 gate
  // passes: two Done Actions, nothing open). The Owner is still IT Staff A.
  await loginViaUi(page, AHMED.email)
  await page.goto(`/staff/tickets/${ticketId}`)
  await addDoneAction(page, secondAction, 'Firmware 2.4 installed and verified.')
  const rows = actionsArea(page).getByTestId('action-row')
  await expect(rows.filter({ hasText: firstAction })).toContainText(SARAH.name)
  await expect(rows.filter({ hasText: secondAction })).toContainText(AHMED.name)
  await expect(page.getByRole('option', { name: 'Resolved', exact: true })).toBeEnabled()
  await page.getByLabel(/current status/i).selectOption('RESOLVED')
  await expect(page.getByTestId('status-badge')).toHaveText('Resolved')
  await expect(page.getByLabel(/ticket owner/i)).toHaveValue(
    String((await (await page.request.get(`/api/staff/tickets/${ticketId}`)).json()).ownerId),
  )
  await expect(page.getByLabel(/ticket owner/i).locator('option:checked')).toHaveText(
    new RegExp(SARAH.name),
  )
  await logout(page)

  // The Requester sees the comment and both Actions, never the note, and
  // the dashboard counts the resolution.
  await loginViaUi(page, REQUESTERS.jennifer.email)
  await page.goto(`/tickets/${ticketId}`)
  await expect(page.getByText(comment)).toBeVisible()
  await expect(actionsArea(page).getByText(firstAction)).toBeVisible()
  await expect(actionsArea(page).getByText(secondAction)).toBeVisible()
  await expect(actionsArea(page).getByRole('button', { name: 'Add Action' })).toHaveCount(0)
  await expect(page.getByText(note)).toHaveCount(0)
  await expect(page.getByTestId('status-badge')).toHaveText('Resolved')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Dashboard' })
    .click()
  const after = await requesterMetrics(page)
  expect(after.openTickets.value).toBe(before.openTickets.value)
  expect(after.resolvedLast30Days.value).toBe(before.resolvedLast30Days.value + 1)
  await expect(
    page.getByRole('link', {
      name: `Resolved (Last 30 Days): ${after.resolvedLast30Days.value}. View tickets`,
    }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Recently Resolved' })
      .getByRole('link', { name: ticketNumber }),
  ).toBeVisible()
  await logout(page)

  // Lab 3: the Administrator deactivates a staff user (login refused), then
  // reactivates them (login reaches the first-login password change).
  const staffName = `Regression Staff ${stamp}`
  const staffEmail = `regression-staff-${stamp}@lab4.regression.test.invalid`
  await loginViaUi(page, ADMIN)
  const created = await page.request.post('/api/admin/users', {
    data: {
      name: staffName,
      email: staffEmail,
      role: 'IT_STAFF',
      isActive: true,
      initialPassword: TEMP_PASSWORD,
    },
  })
  expect(created.ok()).toBe(true)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'User Management' })
    .click()
  const setActive = async (active: boolean) => {
    await page.getByRole('button', { name: `Edit ${staffName}`, exact: true }).click()
    const panel = page.getByTestId('user-panel')
    await panel.getByLabel('Active').setChecked(active)
    await panel.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText('User updated.')).toBeVisible()
  }
  await setActive(false)
  await logout(page)
  await loginViaUi(page, staffEmail, TEMP_PASSWORD, '**/login')
  await expect(page.getByText('This account is inactive. Contact an Administrator.')).toBeVisible()

  await loginViaUi(page, ADMIN)
  await page.goto('/admin/users')
  await setActive(true)
  await logout(page)
  await loginViaUi(page, staffEmail, TEMP_PASSWORD, '**/change-password')
  await expect(page.getByRole('heading', { name: 'Change Your Password' })).toBeVisible()

  expect(problems).toEqual([])
})

// The three forms ui-spec.md §2.1 allows, computed in Asia/Bangkok.
function bangkokForms(iso: string) {
  const fmt = (parts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', ...parts })
      .format(new Date(iso))
      .replace('Sept', 'Sep')
  const date = { day: 'numeric', month: 'short', year: 'numeric' } as const
  const time = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
  return [fmt(date), fmt({ ...date, ...time }), fmt(time)]
}

async function expectBangkokTimes(page: Page) {
  const times = page.locator('time[datetime]')
  await expect(times.first()).toBeVisible()
  const pairs = await times.evaluateAll((els) =>
    els.map((el) => [el.getAttribute('datetime')!, el.textContent!.trim()]),
  )
  for (const [iso, text] of pairs) expect(bangkokForms(iso)).toContain(text)
}

test('E2E-13: a New York browser sees Bangkok times on Requester and staff screens', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://localhost:5173',
    timezoneId: 'America/New_York',
  })
  const page = await context.newPage()
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(
    'America/New_York',
  )

  await loginViaApi(page.request, REQUESTERS.jennifer.email)
  const own = (await (await page.request.get('/api/tickets')).json()).data[0] as { id: number }
  for (const path of ['/dashboard', '/tickets', `/tickets/${own.id}`]) {
    await page.goto(path)
    await expectBangkokTimes(page)
  }

  await loginViaApi(page.request, SARAH.email)
  for (const path of ['/dashboard', `/staff/tickets/${own.id}`]) {
    await page.goto(path)
    await expectBangkokTimes(page)
  }
  await context.close()
})
