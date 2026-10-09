import { expect, test } from '@playwright/test'
import { loginViaApi, loginViaUi, REQUESTERS, SEED_PASSWORD } from '../lab-02/helpers'

// specification.md §6/§12-14, api-spec.md §1, ui-spec.md §2/§3: the real
// Login and mandatory Change Password screens, role-scoped navigation, and
// logout — end to end. Issue #10 broadens coverage beyond auth.

const STAFF = { name: 'Sarah Johnson', email: 'sarah.johnson@example.com' }
const ADMIN = { name: 'Alex Morgan', email: 'alex.morgan@example.com' }
const TEMP_PASSWORD = 'Temp1234!'
const NEW_PASSWORD = 'N3wSecret!'

test.describe('Login', () => {
  test('signs a Requester in and reaches their default landing screen', async ({ page }) => {
    await loginViaUi(page, REQUESTERS.jennifer.email)
    await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
    await expect(page.getByTestId('current-user')).toContainText('Jennifer Anderson')
  })

  test('shows a generic invalid-credentials banner for a wrong password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email address/i).fill(REQUESTERS.jennifer.email)
    await page.getByLabel(/^password/i).fill('WrongPassword1!')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByText('Invalid email or password. Please try again.')).toBeVisible()
    await expect(page.getByLabel(/^password/i)).toHaveValue('')
  })

  test('shows a distinct inactive-account banner', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email address/i).fill(REQUESTERS.patricia.email)
    await page.getByLabel(/^password/i).fill(SEED_PASSWORD)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(
      page.getByText('This account is inactive. Contact an Administrator.'),
    ).toBeVisible()
  })
})

test.describe('Role-scoped navigation', () => {
  test('a Requester sees only My Tickets and Create Ticket', async ({ page }) => {
    await loginViaUi(page, REQUESTERS.jennifer.email)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'My Tickets' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Create Ticket' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Ticket Queue' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'User Management' })).toHaveCount(0)
  })

  test('IT Staff sees only Ticket Queue', async ({ page }) => {
    await loginViaUi(page, STAFF.email, SEED_PASSWORD, '**/staff/tickets')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Ticket Queue' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'My Tickets' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'User Management' })).toHaveCount(0)
  })

  // Lab 4 (docs/lab-04/tests.md §6): BR-29 adds the Ticket Queue to the
  // Administrator nav.
  test('an Administrator sees User Management and Ticket Queue', async ({ page }) => {
    await loginViaUi(page, ADMIN.email, SEED_PASSWORD, '**/admin/users')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'User Management' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Ticket Queue' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'My Tickets' })).toHaveCount(0)
  })
})

test.describe('Mandatory first-login password change', () => {
  test('a freshly Administrator-created user must change their password before reaching the app', async ({
    page,
    context,
  }) => {
    await loginViaApi(context.request, ADMIN.email)
    // .invalid (RFC 2606), not @example.com — the seed-integration test
    // asserts every @example.com account's password, so a throwaway fixture
    // must live outside that domain.
    const email = `e2e-forced-change-${Date.now()}@lab3.auth-e2e.test.invalid`
    const createRes = await context.request.post('/api/admin/users', {
      data: {
        name: 'E2E Forced Change',
        email,
        role: 'REQUESTER',
        isActive: true,
        initialPassword: TEMP_PASSWORD,
      },
    })
    expect(createRes.ok()).toBe(true)

    await loginViaUi(page, email, TEMP_PASSWORD, '**/change-password')
    await expect(page.getByRole('heading', { name: 'Change Your Password' })).toBeVisible()

    // FR-02/BR-02/AC-02: no other screen is reachable until this succeeds.
    await page.goto('/tickets')
    await expect(page.getByRole('heading', { name: 'Change Your Password' })).toBeVisible()

    await page.getByLabel(/^current \(temporary\) password/i).fill(TEMP_PASSWORD)
    await page.getByLabel(/^new password/i).fill(NEW_PASSWORD)
    await page.getByLabel(/^confirm new password/i).fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
  })
})

test.describe('Logout', () => {
  test('ends the session and blocks further access to protected routes', async ({ page }) => {
    await loginViaUi(page, REQUESTERS.jennifer.email)
    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()

    await page.goto('/tickets')
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  })
})
