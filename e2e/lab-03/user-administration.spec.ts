import { expect, test } from '@playwright/test'
import { loginViaApi, loginViaUi, SEED_PASSWORD } from '../lab-02/helpers'

// specification.md §6, ui-spec.md §7, api-spec.md §5: the Administrator User
// Management lifecycle end to end — create, forced first-login password
// change, edit, deactivate, and the FR-25/FR-26 safety rails.

const ADMIN = { name: 'Alex Morgan', email: 'alex.morgan@example.com' }
const TEMP_PASSWORD = 'Temp1234!'

test('an Administrator creates a user, who must change their password at first login', async ({
  page,
}) => {
  await loginViaUi(page, ADMIN.email, SEED_PASSWORD, '**/admin/users')

  const email = `e2e-created-${Date.now()}@lab3.admin-e2e.test.invalid`
  await page.getByRole('button', { name: 'Create User' }).click()
  const panel = page.getByTestId('user-panel')
  await panel.getByLabel(/full name/i).fill('E2E Created User')
  await panel.getByLabel(/email address/i).fill(email)
  await panel.getByLabel(/role/i).selectOption('REQUESTER')
  await panel.getByLabel(/initial password/i).fill(TEMP_PASSWORD)
  await panel.getByRole('button', { name: 'Save User' }).click()

  await expect(page.getByText('User created.')).toBeVisible()
  await expect(page.getByTestId('user-panel')).toHaveCount(0)
  await expect(page.getByText('E2E Created User').first()).toBeVisible()

  await loginViaUi(page, email, TEMP_PASSWORD, '**/change-password')
  await expect(page.getByRole('heading', { name: 'Change Your Password' })).toBeVisible()
})

test('editing a user takes effect immediately, deactivating kills their session, and blocks their next login', async ({
  page,
  context,
  request,
}) => {
  await loginViaApi(context.request, ADMIN.email)
  const stamp = Date.now()
  const name = `E2E Edit Fixture ${stamp}`
  const renamed = `E2E Edit Fixture ${stamp} Renamed`
  const email = `e2e-edited-${stamp}@lab3.admin-e2e.test.invalid`
  const created = await context.request.post('/api/admin/users', {
    data: { name, email, role: 'IT_STAFF', isActive: true, initialPassword: TEMP_PASSWORD },
  })
  expect(created.ok()).toBe(true)

  // BR-34 promises the target's *existing* session dies immediately, not
  // just that a later login is blocked (api-spec.md §5.3) - the `request`
  // fixture is its own cookie jar, independent of `context`/`page`, so the
  // fixture user's session survives the Administrator logging in below.
  await loginViaApi(request, email, TEMP_PASSWORD)
  expect((await request.get('/api/auth/me')).status()).toBe(200)

  await loginViaUi(page, ADMIN.email, SEED_PASSWORD, '**/admin/users')

  // FR-22: edit name/role.
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click()
  const editPanel = page.getByTestId('user-panel')
  await editPanel.getByLabel(/full name/i).fill(renamed)
  await editPanel.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText('User updated.')).toBeVisible()
  await expect(page.getByText(renamed).first()).toBeVisible()

  // FR-22/BR-34: deactivate.
  await page.getByRole('button', { name: `Edit ${renamed}`, exact: true }).click()
  await page.getByTestId('user-panel').getByLabel('Active').uncheck()
  await page.getByTestId('user-panel').getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText('User updated.')).toBeVisible()

  // The existing session from before the edit is dead on its very next
  // request, not just at its natural expiry (BR-34).
  expect((await request.get('/api/auth/me')).status()).toBe(401)

  // A later login attempt is also rejected, with the inactive-account
  // message, not the generic one.
  await loginViaUi(page, email, TEMP_PASSWORD, '**/login')
  await expect(page.getByText('This account is inactive. Contact an Administrator.')).toBeVisible()
})

test("disables the sole Administrator's own Active toggle and Role select, with explanations", async ({
  page,
}) => {
  await loginViaUi(page, ADMIN.email, SEED_PASSWORD, '**/admin/users')

  await page.getByRole('button', { name: `Edit ${ADMIN.name}` }).click()
  const panel = page.getByTestId('user-panel')

  // FR-25/BR-35: self-deactivation.
  await expect(panel.getByLabel('Active')).toBeDisabled()
  await expect(panel.getByText("You can't deactivate your own account.")).toBeVisible()

  // FR-26/BR-36: Alex Morgan is the only seeded Administrator.
  await expect(panel.getByLabel(/role/i)).toBeDisabled()
  await expect(panel.getByText('At least one active Administrator is required.')).toBeVisible()
})
