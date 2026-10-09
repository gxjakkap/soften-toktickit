import { expect, test, type Page } from '@playwright/test'
import { createTicketViaApi, loginViaApi, REQUESTERS, VIEWPORTS } from '../lab-02/helpers'

// E2E-01, E2E-02 (AC-01, AC-05..AC-07, AC-11, AC-14, AC-27, AC-41):
// docs/lab-04 ui-spec.md §5.2, §6, §10. Each test files its own Ticket as a
// seeded Requester, so reruns start from a Ticket with no Actions and the
// seeded data stays untouched; e2e/clean-fixtures.ts removes the fixtures.

const SARAH = 'sarah.johnson@example.com'
const AHMED = 'ahmed.hassan@example.com'
const ADMIN = 'alex.morgan@example.com'

const area = (page: Page) => page.locator('#actions-taken')
const rows = (page: Page) => area(page).getByTestId('action-row')
const statusSelect = (page: Page) => page.getByLabel(/current status/i)

// Switches the page's session and opens the staff Ticket Detail.
async function openAsStaff(page: Page, email: string, ticketId: number) {
  await loginViaApi(page.request, email)
  await page.goto(`/staff/tickets/${ticketId}`)
  await expect(area(page).getByRole('heading', { name: /^Actions Taken \(\d+\)$/ })).toBeVisible()
}

async function addAction(
  page: Page,
  fields: { description: string; status?: string; result?: string; assignee?: string },
) {
  const before = await rows(page).count()
  await area(page).getByRole('button', { name: 'Add Action' }).click()
  const form = area(page).locator('form')
  await expect(form.getByRole('heading', { name: 'New Action' })).toBeFocused()
  await form.getByLabel(/action description/i).fill(fields.description)
  if (fields.status) await form.getByLabel(/^status/i).selectOption(fields.status)
  if (fields.result) await form.getByLabel(/^result/i).fill(fields.result)
  if (fields.assignee)
    await form.getByLabel(/assigned to/i).selectOption({ label: fields.assignee })
  return {
    form,
    save: async () => {
      await form.getByRole('button', { name: 'Save Action' }).click()
      await expect(rows(page)).toHaveCount(before + 1)
      await expect(area(page).getByRole('button', { name: 'Add Action' })).toBeFocused()
    },
  }
}

const rowWith = (page: Page, text: string) => rows(page).filter({ hasText: text })

test('E2E-01: staff record, edit, and finish Actions until the Ticket can be Resolved', async ({
  page,
}) => {
  await loginViaApi(page.request, REQUESTERS.jennifer.email)
  const ticket = await createTicketViaApi(page.request, {
    summary: `Actions Taken flow ${Date.now()}`,
  })

  // Sarah (IT Staff A) claims the Ticket and starts work.
  await openAsStaff(page, SARAH, ticket.id)
  await expect(area(page).getByText('No actions recorded yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Claim' }).click()
  await expect(page.getByLabel(/ticket owner/i)).toHaveValue(/\d+/)
  await statusSelect(page).selectOption('IN_PROGRESS')
  await expect(page.getByTestId('status-badge')).toHaveText('In Progress')
  await expect(page.getByRole('option', { name: 'Resolved (blocked)' })).toBeDisabled()

  // Validation failure: an empty description never reaches the server.
  const first = await addAction(page, { description: '' })
  await first.form.getByRole('button', { name: 'Save Action' }).click()
  await expect(first.form.getByText('Describe the action taken.')).toBeVisible()
  await expect(first.form.getByLabel(/action description/i)).toBeFocused()
  await first.form.getByLabel(/action description/i).fill('Ran the battery diagnostic.')
  await first.form.getByRole('button', { name: 'Save Action' }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(page.getByTestId('workflow-announcement')).toHaveText('Action added.')

  // BR-04, AC-05: the picker offers only active staff, and the server still
  // rejects an inactive assignee sent directly.
  await area(page).getByRole('button', { name: 'Add Action' }).click()
  const assignee = area(page).getByLabel(/assigned to/i)
  await expect(assignee.getByRole('option', { name: /Linda Park/ })).toHaveCount(0)
  await area(page).getByRole('button', { name: 'Cancel' }).click()
  await loginViaApi(page.request, ADMIN)
  const users = await (await page.request.get('/api/admin/users?search=Linda%20Park')).json()
  await loginViaApi(page.request, SARAH)
  const rejected = await page.request.post(`/api/staff/tickets/${ticket.id}/actions`, {
    data: {
      actionAt: new Date().toISOString(),
      description: 'Assign to an inactive user.',
      assignedToId: users.data[0].id,
    },
  })
  expect(rejected.status()).toBe(400)
  expect((await rejected.json()).error.code).toBe('INVALID_ASSIGNEE')

  // BR-02, AC-14: Ahmed (IT Staff B) and the Administrator record Actions on
  // Sarah's Ticket.
  await openAsStaff(page, AHMED, ticket.id)
  await (
    await addAction(page, {
      description: 'Order a replacement battery.',
      assignee: 'Sarah Johnson',
    })
  ).save()

  await openAsStaff(page, ADMIN, ticket.id)
  const adminAction = await addAction(page, {
    description: 'Approved the battery purchase.',
    status: 'DONE',
    result: 'Purchase order raised.',
  })
  await adminAction.form.getByRole('checkbox', { name: 'Follow-Up Required?' }).check()
  await adminAction.form.getByLabel(/follow-up note/i).fill('Confirm delivery with the vendor.')
  await adminAction.save()

  // Back as Sarah: three performers on one Ticket, and she is still Owner.
  await openAsStaff(page, SARAH, ticket.id)
  await expect(rows(page)).toHaveCount(3)
  await expect(rowWith(page, 'Ran the battery diagnostic.')).toContainText('Sarah Johnson')
  await expect(rowWith(page, 'Order a replacement battery.')).toContainText('Ahmed Hassan')
  await expect(rowWith(page, 'Approved the battery purchase.')).toContainText('Alex Morgan')
  await expect(page.getByLabel(/ticket owner/i).locator('option:checked')).toHaveText(
    'Sarah Johnson',
  )
  const callout = page.getByTestId('resolution-gate-callout')
  await expect(callout).toContainText('Finish or cancel every Planned or In Progress action.')
  await expect(callout).toContainText('Clear every pending follow-up.')

  // Cancel her own Planned Action (inline confirmation).
  await rowWith(page, 'Ran the battery diagnostic.').getByRole('button', { name: /^Edit/ }).click()
  let form = area(page).locator('form')
  await expect(form.getByRole('heading', { name: 'Edit Action' })).toBeFocused()
  await form.getByLabel(/^status/i).selectOption('CANCELLED')
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await form.getByRole('button', { name: 'Cancel action' }).click()
  await expect(rowWith(page, 'Ran the battery diagnostic.')).toContainText('Cancelled')
  await expect(rowWith(page, 'Ran the battery diagnostic.').getByRole('button')).toHaveCount(0)

  // Complete Ahmed's Action: Done needs a Result (BR-08).
  await rowWith(page, 'Order a replacement battery.').getByRole('button', { name: /^Edit/ }).click()
  form = area(page).locator('form')
  await form.getByLabel(/^status/i).selectOption('DONE')
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await expect(form.getByText('Enter the result before marking the action Done.')).toBeVisible()
  await form.getByLabel(/^result/i).fill('New battery fitted.')
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await expect(rowWith(page, 'Order a replacement battery.')).toContainText('Done')
  await expect(callout).not.toContainText('Finish or cancel')

  // AC-11: clear the follow-up on the Administrator's Done Action.
  await rowWith(page, 'Approved the battery purchase.')
    .getByRole('button', { name: /^Edit follow-up/ })
    .click()
  form = area(page).locator('form')
  await expect(form.getByRole('textbox', { name: /action description/i })).toHaveCount(0)
  await form.getByRole('checkbox', { name: 'Follow-Up Required?' }).uncheck()
  await form.getByRole('button', { name: 'Save Changes' }).click()
  await expect(form).toHaveCount(0)

  // AC-27: the gate passes without a reload, and Resolved goes through.
  await expect(callout).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Resolved', exact: true })).toBeEnabled()
  await statusSelect(page).selectOption('RESOLVED')
  await expect(page.getByTestId('status-badge')).toHaveText('Resolved')
  await expect(area(page).getByRole('button', { name: 'Add Action' })).toHaveCount(0)
  await expect(area(page)).toContainText(
    'This ticket is Resolved. Reopen it to record more actions.',
  )

  // E2E-02 (AC-07): the Requester sees every Action, read-only.
  await loginViaApi(page.request, REQUESTERS.jennifer.email)
  await page.goto(`/tickets/${ticket.id}`)
  await expect(rows(page)).toHaveCount(3)
  await expect(area(page)).toContainText('Work recorded by IT Staff on your ticket.')
  await expect(rowWith(page, 'Order a replacement battery.')).toContainText('New battery fitted.')
  await expect(rowWith(page, 'Approved the battery purchase.')).toContainText(
    'Purchase order raised.',
  )
  await expect(area(page).getByRole('button')).toHaveCount(0)
  await expect(area(page).locator('form')).toHaveCount(0)

  // AC-06: the Requester can't write through the staff endpoint either.
  const forbidden = await page.request.post(`/api/staff/tickets/${ticket.id}/actions`, {
    data: { actionAt: new Date().toISOString(), description: 'Requester attempt.' },
  })
  expect(forbidden.status()).toBe(403)
})

test.describe('AC-41: Actions Taken layout', () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`has no horizontal overflow at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await loginViaApi(page.request, REQUESTERS.jennifer.email)
      const ticket = await createTicketViaApi(page.request, {
        summary: `Actions Taken layout ${name} ${Date.now()}`,
      })
      await loginViaApi(page.request, SARAH)
      // ui-spec.md §10: long unbroken text must wrap, not widen the page.
      const unbroken = 'x'.repeat(300)
      for (const description of [`Long ${unbroken}`, 'Short action']) {
        const res = await page.request.post(`/api/staff/tickets/${ticket.id}/actions`, {
          data: {
            actionAt: new Date().toISOString(),
            description,
            followUpRequired: true,
            followUpNote: `Note ${unbroken}`,
            attachmentNotes: `file-${unbroken}.pdf`,
          },
        })
        expect(res.status()).toBe(201)
      }

      const noOverflow = async () =>
        expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(
          viewport.width + 1,
        )

      await page.goto(`/staff/tickets/${ticket.id}`)
      await expect(rows(page)).toHaveCount(2)
      // Table on desktop/tablet, stacked cards on mobile (ui-spec.md §10).
      const mobile = viewport.width < 768
      await expect(area(page).locator('table')).toHaveCount(mobile ? 0 : 1)
      await expect(area(page).locator('article')).toHaveCount(mobile ? 2 : 0)
      await noOverflow()

      await area(page).getByRole('button', { name: 'Add Action' }).click()
      await expect(area(page).getByRole('heading', { name: 'New Action' })).toBeVisible()
      await noOverflow()
      await area(page).getByRole('button', { name: 'Cancel' }).click()

      await rowWith(page, 'Short action').getByRole('button', { name: /^Edit/ }).click()
      await expect(area(page).getByRole('heading', { name: 'Edit Action' })).toBeVisible()
      await noOverflow()

      await loginViaApi(page.request, REQUESTERS.jennifer.email)
      await page.goto(`/tickets/${ticket.id}`)
      await expect(rows(page)).toHaveCount(2)
      await noOverflow()
    })
  }
})

test('AC-41, AC-44: an open edit survives crossing the mobile breakpoint', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await loginViaApi(page.request, REQUESTERS.jennifer.email)
  const ticket = await createTicketViaApi(page.request, {
    summary: `Actions Taken rotate ${Date.now()}`,
  })
  await loginViaApi(page.request, SARAH)
  const res = await page.request.post(`/api/staff/tickets/${ticket.id}/actions`, {
    data: { actionAt: new Date().toISOString(), description: 'Saved description.' },
  })
  expect(res.status()).toBe(201)

  await page.goto(`/staff/tickets/${ticket.id}`)
  await rowWith(page, 'Saved description.').getByRole('button', { name: /^Edit/ }).click()
  const description = area(page).getByLabel(/action description/i)
  await description.fill('Typed before rotating.')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(area(page).locator('table')).toHaveCount(0)
  await expect(area(page).locator('.zg-ticket-cards form')).toHaveCount(1)
  await expect(description).toHaveValue('Typed before rotating.')

  await page.setViewportSize(VIEWPORTS.desktop)
  await expect(area(page).locator('table form')).toHaveCount(1)
  await expect(description).toHaveValue('Typed before rotating.')
  await area(page).locator('form').getByRole('button', { name: 'Save Changes' }).click()
  await expect(rowWith(page, 'Typed before rotating.')).toHaveCount(1)
})
