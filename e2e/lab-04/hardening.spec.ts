import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { loginViaApi, REQUESTERS } from '../lab-02/helpers'

// A11Y-01, STYLE-03, HARD-01 — AC-34, AC-41, AC-42, AC-43: docs/lab-04
// ui-spec.md §9, §10, §11, §12 (FR-19, FR-24). Every major screen, for every
// role and the password-change and inactive accounts, at 1440, 768, and
// 375 px: no console error or warning, no failed same-origin request other
// than the 4xx a negative case expects, no horizontal page scroll, and no
// serious or critical axe violation. Read-only: it changes no data.

const WIDTHS = [1440, 768, 375]
const STAFF = 'sarah.johnson@example.com'
const ADMIN = 'alex.morgan@example.com'

type Screen = {
  name: string
  path: string
  // The 4xx statuses this negative case is meant to produce.
  expectStatus?: number[]
  // Brings the screen into the state under test once it has loaded.
  open?: (page: Page) => Promise<void>
  ready: (page: Page) => Promise<void>
}

const heading = (name: string | RegExp) => async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

async function checkScreen(page: Page, screen: Screen) {
  for (const width of WIDTHS) {
    await test.step(`${screen.name} @ ${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 })
      const expected = screen.expectStatus ?? []
      const problems: string[] = []
      const onConsole = (msg: { type: () => string; text: () => string }) => {
        if (msg.type() !== 'error' && msg.type() !== 'warning') return
        // The browser logs every non-2xx fetch; those are judged below by status.
        const status = msg.text().match(/status of (\d{3})/)?.[1]
        if (status && expected.includes(Number(status))) return
        problems.push(`console ${msg.type()}: ${msg.text()}`)
      }
      const onResponse = (res: { url: () => string; status: () => number }) => {
        if (!res.url().startsWith('http://localhost:5173')) return
        if (res.status() >= 400 && !expected.includes(res.status()))
          problems.push(`HTTP ${res.status()} ${res.url()}`)
      }
      const onFailed = (req: { url: () => string }) => problems.push(`request failed ${req.url()}`)
      page.on('console', onConsole)
      page.on('response', onResponse)
      page.on('requestfailed', onFailed)

      await page.goto(screen.path)
      await screen.ready(page)
      await screen.open?.(page)
      await page.waitForLoadState('networkidle')

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      expect(scrollWidth, 'horizontal page scroll').toBeLessThanOrEqual(innerWidth)

      const axe = await new AxeBuilder({ page }).analyze()
      const serious = axe.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
      expect(serious, 'serious/critical axe violations').toEqual([])

      page.off('console', onConsole)
      page.off('response', onResponse)
      page.off('requestfailed', onFailed)
      expect(problems, 'console errors and failed requests').toEqual([])
    })
  }
}

async function signedIn(browser: Browser, email?: string) {
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' })
  const page = await context.newPage()
  if (email) await loginViaApi(page.request, email)
  return { context, page }
}

test.describe.configure({ timeout: 300_000 })

test('HARD-01: login, change password, and system check', async ({ browser }) => {
  const anon = await signedIn(browser)
  const signIn = (page: Page) =>
    expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  // Anonymous screens ask /api/auth/me first; 401 is the expected answer.
  for (const screen of [
    { name: 'Login', path: '/login', expectStatus: [401], ready: signIn },
    {
      name: 'Login validation errors',
      path: '/login',
      expectStatus: [401],
      ready: signIn,
      open: async (page: Page) => {
        await page.getByRole('button', { name: 'Sign In' }).click()
        await expect(page.getByText('Email address is required.')).toBeVisible()
      },
    },
    {
      name: 'Login inactive account',
      path: '/login',
      expectStatus: [401, 403],
      ready: signIn,
      open: async (page: Page) => {
        await page.getByLabel(/email address/i).fill(REQUESTERS.patricia.email)
        await page.getByLabel(/^password/i).fill('DevPass123!')
        await page.getByRole('button', { name: 'Sign In' }).click()
        await expect(page.getByText(/this account is inactive/i)).toBeVisible()
      },
    },
    {
      name: 'System check',
      path: '/system-check',
      expectStatus: [401],
      ready: heading('TokTickIT IT Service Desk'),
    },
  ] satisfies Screen[])
    await checkScreen(anon.page, screen)
  await anon.context.close()

  const pw = await signedIn(browser, REQUESTERS.siriporn.email)
  await checkScreen(pw.page, {
    name: 'Change password (redirected from My Tickets)',
    path: '/tickets',
    ready: async (page) => {
      await page.waitForURL('**/change-password')
      await expect(page.getByRole('heading', { name: 'Change Your Password' })).toBeVisible()
    },
  })
  await pw.context.close()
})

test('HARD-01: Requester screens', async ({ browser }) => {
  const { context, page } = await signedIn(browser, REQUESTERS.jennifer.email)
  const mine = (await (await page.request.get('/api/tickets')).json()) as {
    data: { id: number; currentStatus: string }[]
  }
  const open = mine.data.find((t) => !['CLOSED', 'CANCELLED'].includes(t.currentStatus))!
  const screens: Screen[] = [
    { name: 'Requester dashboard', path: '/dashboard', ready: heading('Dashboard') },
    { name: 'My Tickets', path: '/tickets', ready: heading('My Tickets') },
    {
      name: 'My Tickets no results',
      path: '/tickets?search=zzzz-no-match',
      ready: async (p) => {
        await expect(p.getByText('No tickets match your filters')).toBeVisible()
      },
    },
    {
      name: 'My Tickets invalid filter',
      path: '/tickets?resolvedFrom=not-a-date',
      expectStatus: [400],
      ready: async (p) => {
        await expect(p.getByRole('button', { name: 'Clear filters' })).toBeVisible()
      },
    },
    { name: 'Create Ticket', path: '/tickets/new', ready: heading('Create Ticket') },
    {
      name: 'Create Ticket validation',
      path: '/tickets/new',
      ready: heading('Create Ticket'),
      open: async (p) => {
        await p.getByRole('button', { name: 'Submit' }).click()
        await expect(p.locator('.zg-error-message').first()).toBeVisible()
      },
    },
    { name: 'Requester Ticket Detail', path: `/tickets/${open.id}`, ready: heading(/.+/) },
    {
      name: 'Requester Ticket Detail confirm dialog',
      path: `/tickets/${open.id}`,
      ready: heading(/.+/),
      open: async (p) => {
        const trigger = p.getByRole('button', { name: 'Problem Appears Resolved' })
        if (await trigger.isVisible()) {
          await trigger.click()
          await expect(p.getByRole('dialog')).toBeVisible()
        }
      },
    },
    {
      name: 'Requester Ticket not found',
      path: '/tickets/99999999',
      expectStatus: [404],
      ready: heading('Ticket not found.'),
    },
    {
      name: 'Requester on the Ticket Queue (forbidden)',
      path: '/staff/tickets',
      ready: heading("You don't have access to this page."),
    },
    {
      name: 'Requester on User Management (forbidden)',
      path: '/admin/users',
      ready: heading("You don't have access to this page."),
    },
  ]
  for (const screen of screens) await checkScreen(page, screen)
  await context.close()

  const empty = await signedIn(browser, REQUESTERS.emma.email)
  await checkScreen(empty.page, {
    name: 'Requester dashboard empty state',
    path: '/dashboard',
    ready: async (p) => {
      await expect(p.getByText("You haven't submitted any tickets yet.")).toBeVisible()
    },
  })
  await checkScreen(empty.page, {
    name: 'My Tickets empty state',
    path: '/tickets',
    ready: async (p) => {
      await expect(p.getByText("You haven't created any tickets yet")).toBeVisible()
    },
  })
  await empty.context.close()
})

async function staffScreens(page: Page): Promise<Screen[]> {
  // A seeded active Ticket with a pending follow-up has several Actions.
  const withActions = (
    (await (await page.request.get('/api/staff/tickets?followUp=pending')).json()) as {
      data: { id: number }[]
    }
  ).data[0]
  const closed = (
    (await (await page.request.get('/api/staff/tickets?status=CLOSED')).json()) as {
      data: { id: number }[]
    }
  ).data[0]
  return [
    { name: 'Staff dashboard', path: '/dashboard', ready: heading('Dashboard') },
    { name: 'Ticket Queue', path: '/staff/tickets', ready: heading('Ticket Queue') },
    {
      name: 'Ticket Queue invalid filter',
      path: '/staff/tickets?followUp=bogus',
      expectStatus: [400],
      ready: async (p) => {
        await expect(p.getByRole('button', { name: 'Clear filters' })).toBeVisible()
      },
    },
    {
      name: 'Staff Ticket Detail with Actions',
      path: `/staff/tickets/${withActions.id}`,
      ready: heading(/.+/),
    },
    {
      name: 'Staff Ticket Detail, Add Action form with validation errors',
      path: `/staff/tickets/${withActions.id}`,
      ready: heading(/.+/),
      open: async (p) => {
        await p.getByRole('button', { name: /add action/i }).click()
        await p.getByLabel(/follow-up required/i).check()
        await p.getByRole('button', { name: 'Save Action' }).click()
        await expect(p.locator('.zg-error-message').first()).toBeVisible()
      },
    },
    {
      name: 'Staff Ticket Detail, Closed',
      path: `/staff/tickets/${closed.id}`,
      ready: heading(/.+/),
    },
    {
      name: 'Staff Ticket not found',
      path: '/staff/tickets/99999999',
      expectStatus: [404],
      ready: heading('Ticket not found.'),
    },
  ]
}

test('HARD-01: IT Staff screens', async ({ browser }) => {
  const { context, page } = await signedIn(browser, STAFF)
  const screens = await staffScreens(page)
  screens.push(
    {
      name: 'IT Staff on User Management (forbidden)',
      path: '/admin/users',
      ready: heading("You don't have access to this page."),
    },
    {
      name: 'IT Staff on Create Ticket (forbidden)',
      path: '/tickets/new',
      ready: heading("You don't have access to this page."),
    },
  )
  for (const screen of screens) await checkScreen(page, screen)
  await context.close()
})

test('HARD-01: Administrator screens', async ({ browser }) => {
  const { context, page } = await signedIn(browser, ADMIN)
  const screens = await staffScreens(page)
  screens.push(
    { name: 'User Management', path: '/admin/users', ready: heading('User Management') },
    {
      name: 'User Management role drill-down',
      path: '/admin/users?role=IT_STAFF',
      ready: heading('User Management'),
    },
    {
      name: 'User Management create panel with validation errors',
      path: '/admin/users',
      ready: heading('User Management'),
      open: async (p) => {
        await p.getByRole('button', { name: /create user/i }).click()
        await p.getByRole('button', { name: 'Save User' }).click()
        await expect(p.getByText('Name is required.')).toBeVisible()
      },
    },
  )
  for (const screen of screens) await checkScreen(page, screen)
  await context.close()
})

// HARD-02 — AC-37: ui-spec.md §2.1, §12. With the browser in New York, the
// Ticket Detail date and a Ticket Queue date still read Bangkok.
test('HARD-02: dates render in Bangkok time under a non-Bangkok browser zone', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://localhost:5173',
    timezoneId: 'America/New_York',
  })
  const page = await context.newPage()
  await loginViaApi(page.request, STAFF)
  const ticket = (
    (await (await page.request.get('/api/staff/tickets')).json()) as {
      data: { id: number; createdAt: string }[]
    }
  ).data[0]
  const bangkok = (iso: string, withTime: boolean) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
    })
      .format(new Date(iso))
      .replace('Sept', 'Sep')

  await page.goto('/staff/tickets')
  await expect(page.locator(`time[datetime="${ticket.createdAt}"]`).first()).toHaveText(
    bangkok(ticket.createdAt, false),
  )

  await page.goto(`/staff/tickets/${ticket.id}`)
  await expect(page.getByText('Times shown in Bangkok time (UTC+7)')).toBeVisible()
  await expect(page.locator(`time[datetime="${ticket.createdAt}"]`).first()).toHaveText(
    bangkok(ticket.createdAt, true),
  )
  await context.close()
})

// HARD-03 — AC-42: ui-spec.md §9. Keyboard focus is visible on the green
// header (white ring) and on the page (Zen Green ring).
test('HARD-03: focus ring is visible on header and page links', async ({ browser }) => {
  const { context, page } = await signedIn(browser, STAFF)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  const ring = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as HTMLElement)
      return `${style.outlineStyle} ${style.outlineColor}`
    })

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'TokTickIT' })).toBeFocused()
  expect(await ring()).toBe('solid rgb(255, 255, 255)')

  await page.getByRole('link', { name: /^Unassigned: \d+\. View tickets$/ }).focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  expect(await ring()).toBe('solid rgb(11, 122, 70)')
  await context.close()
})
