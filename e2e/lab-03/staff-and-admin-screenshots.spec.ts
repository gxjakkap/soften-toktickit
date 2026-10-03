import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  createTicketViaApi,
  loginViaApi,
  loginViaUi,
  REQUESTERS,
  SEED_PASSWORD,
  VIEWPORTS,
} from '../lab-02/helpers'

// ui-spec.md §11: the four screenshot triads not yet captured by
// e2e/lab-03/screenshots.spec.ts (which only re-captured the Lab 2 screens).
// Login, Change Password, Ticket Queue, Ticket Detail (IT Staff), and User
// Management each get a desktop/tablet/mobile capture with a real
// `document.body.scrollWidth` assertion backing "no horizontal scroll"
// (ui-spec.md §9), the same STYLE convention as screenshots.spec.ts.

const shot = (...parts: string[]) =>
  path.join(__dirname, '../../artifacts/lab-03/screenshots', ...parts)

const STAFF = { email: 'sarah.johnson@example.com' }
const ADMIN = { email: 'alex.morgan@example.com' }

test.describe('STYLE: responsive screenshots — authentication, staff queue, staff ticket detail, user management', () => {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`at ${viewportName}`, async ({ page, context }) => {
      const assertNoHorizontalScroll = async () => {
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1)
      }
      await page.setViewportSize(viewport)

      // Login (ui-spec.md §2) — unauthenticated.
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
      await assertNoHorizontalScroll()
      await page.screenshot({ path: shot('authentication', `${viewportName}.png`), fullPage: true })

      // Mandatory Change Password (ui-spec.md §3) — Siriporn Wattana is
      // seeded with mustChangePassword: true (e2e/lab-02/helpers.ts).
      await loginViaUi(page, REQUESTERS.siriporn.email, SEED_PASSWORD, '**/change-password')
      await expect(page.getByRole('heading', { name: 'Change Your Password' })).toBeVisible()
      await assertNoHorizontalScroll()
      await page.screenshot({
        path: shot('authentication', `change-password-${viewportName}.png`),
        fullPage: true,
      })

      // Fixture ticket for the Queue/Detail captures below.
      await loginViaApi(context.request, REQUESTERS.jennifer.email)
      const ticket = await createTicketViaApi(context.request, {
        summary: `Screenshot fixture ${viewportName} ${Date.now()}`,
      })

      // IT Staff Ticket Queue (ui-spec.md §5).
      await loginViaUi(page, STAFF.email, SEED_PASSWORD, '**/staff/tickets')
      await expect(page.getByRole('heading', { name: 'Ticket Queue' })).toBeVisible()
      await assertNoHorizontalScroll()
      await page.screenshot({ path: shot('staff-queue', `${viewportName}.png`), fullPage: true })

      // IT Staff Ticket Detail (ui-spec.md §6).
      await page.goto(`/staff/tickets/${ticket.id}`)
      await expect(page.getByText(ticket.ticketNumber)).toBeVisible()
      await assertNoHorizontalScroll()
      await page.screenshot({
        path: shot('staff-ticket-detail', `${viewportName}.png`),
        fullPage: true,
      })

      // Administrator User Management (ui-spec.md §7).
      await loginViaUi(page, ADMIN.email, SEED_PASSWORD, '**/admin/users')
      await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
      await assertNoHorizontalScroll()
      await page.screenshot({
        path: shot('user-management', `${viewportName}.png`),
        fullPage: true,
      })
    })
  }
})
