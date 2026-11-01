// A11Y-02 — AC-42.
import { expect, test, type Page } from '@playwright/test'
import { createTicketViaApi, loginViaApi, REQUESTERS } from '../lab-02/helpers'

// A11Y-02 (AC-42): docs/lab-04 ui-spec.md §9. Keyboard only: Tab reaches
// every dashboard card link in reading order with a visible focus ring and
// an accessible name, Enter drills down, and the Actions Taken form takes
// focus on open and hands it back to its trigger on close.

const STAFF = 'sarah.johnson@example.com'
const CARDS = [
  'My Open Actions',
  'My Active Tickets',
  'Follow-Ups Pending',
  'Unassigned',
  'High Priority',
  'Resolved Today',
]

type Focused = { name: string; visible: boolean }

// The focused element's accessible name (aria-label, else its label, else text) and whether
// it shows an outline or a box-shadow ring.
const focused = (page: Page): Promise<Focused> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const style = getComputedStyle(el)
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
    return {
      name: (
        el.getAttribute('aria-label') ??
        (el as HTMLInputElement).labels?.[0]?.textContent ??
        el.textContent ??
        ''
      ).trim(),
      visible: outline || style.boxShadow !== 'none',
    }
  })

// Tabs forward until the focused element's name matches, or gives up.
async function tabTo(page: Page, name: RegExp, max = 80): Promise<Focused[]> {
  const seen: Focused[] = []
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const now = await focused(page)
    seen.push(now)
    if (name.test(now.name)) return seen
  }
  throw new Error(`Tab never reached ${name}; saw ${seen.map((f) => f.name).join(' | ')}`)
}

test('A11Y-02: Tab reaches every staff dashboard card in order, visibly, and Enter drills down', async ({
  page,
}) => {
  await loginViaApi(page.request, STAFF)
  const data = await (await page.request.get('/api/dashboard/staff')).json()
  await page.goto('/dashboard')
  await expect(
    page.getByRole('link', { name: /^Resolved Today: \d+\. View tickets$/ }),
  ).toBeVisible()

  const seen = await tabTo(page, /^Resolved Today: \d+\. View tickets$/)
  const cards = seen.filter((f) => CARDS.some((label) => f.name.startsWith(`${label}:`)))
  expect(cards.map((f) => f.name.split(':')[0])).toEqual(CARDS)
  for (const f of seen) {
    expect(f.name, 'every focus stop has an accessible name').not.toBe('')
    expect(f.visible, `visible focus on "${f.name}"`).toBe(true)
  }

  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  expect((await focused(page)).name).toMatch(/^Unassigned: \d+\. View tickets$/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(data.metrics.unassigned.drillDown)
})

test('A11Y-02: the Actions Taken form opens, saves, and closes by keyboard with focus return', async ({
  page,
}) => {
  await loginViaApi(page.request, REQUESTERS.jennifer.email)
  const ticket = await createTicketViaApi(page.request, { summary: `Keyboard ${Date.now()}` })
  await loginViaApi(page.request, STAFF)
  await page.goto(`/staff/tickets/${ticket.id}`)
  const area = page.locator('#actions-taken')
  const addAction = area.getByRole('button', { name: 'Add Action' })
  await expect(addAction).toBeVisible()

  await tabTo(page, /^Add Action$/)
  await expect(addAction).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(area.getByRole('heading', { name: 'New Action' })).toBeFocused()

  // Esc is Cancel inside the form, and focus goes back to the trigger.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Escape')
  await expect(area.locator('form')).toHaveCount(0)
  await expect(addAction).toBeFocused()

  // Open again, fill the description, and save with the keyboard alone.
  await page.keyboard.press('Enter')
  await tabTo(page, /^Action Description/i, 20)
  await page.keyboard.type('Checked the cable by keyboard only.')
  const stops = await tabTo(page, /^Save Action$/, 20)
  for (const f of stops) expect(f.visible, `visible focus on "${f.name}"`).toBe(true)
  await page.keyboard.press('Enter')
  await expect(area.getByTestId('action-row')).toHaveCount(1)
  await expect(addAction).toBeFocused()
})
