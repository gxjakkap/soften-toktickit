import { expect, test } from '@playwright/test'
import { createTicketViaApi, loginViaApi, loginViaUi, REQUESTERS } from '../lab-02/helpers'

// Issue #5, specification.md §5 (FR-10, FR-11, BR-03, BR-24, BR-25) and
// ui-spec.md §4: Public Comments and "Problem Appears Resolved" on the
// Requester Ticket Detail screen, end-to-end without the Lab 2 selector.

test.describe('Public Comments', () => {
  test('a Requester posts a comment and sees it appear immediately', async ({ page, context }) => {
    await loginViaApi(context.request, REQUESTERS.jennifer.email)
    const ticket = await createTicketViaApi(context.request, {
      summary: `Public Comments fixture ${Date.now()}`,
    })

    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByText('No comments yet.')).toBeVisible()

    await page.getByLabel(/add a comment/i).fill('Please let me know if you need anything else.')
    await page.getByRole('button', { name: 'Post Comment' }).click()

    const comment = page
      .getByText('Please let me know if you need anything else.')
      .locator('xpath=ancestor::li')
    await expect(comment).toBeVisible()
    await expect(comment.getByText('Jennifer Anderson')).toBeVisible()
    await expect(comment.getByText('Requester')).toBeVisible()
  })
})

test.describe('Problem Appears Resolved', () => {
  test('a Requester confirms the dialog and sees a success badge in place of the button', async ({
    page,
    context,
  }) => {
    await loginViaApi(context.request, REQUESTERS.jennifer.email)
    const ticket = await createTicketViaApi(context.request, {
      summary: `Problem Appears Resolved fixture ${Date.now()}`,
    })

    await page.goto(`/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Problem Appears Resolved' }).click()
    await expect(page.getByRole('dialog')).toContainText(/does not close the ticket/i)
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()

    await expect(page.getByTestId('resolved-badge')).toContainText(/marked resolved by you on/i)
    await expect(page.getByRole('button', { name: 'Problem Appears Resolved' })).toHaveCount(0)

    // BR-24: idempotent — the Current Status never changes.
    await expect(page.getByTestId('status-badge')).toContainText('New')
  })
})

test.describe('Requester regression: real login replaces the Lab 2 selector', () => {
  test('signing in through the real Login screen reaches My Tickets with a Logout action', async ({
    page,
  }) => {
    await loginViaUi(page, REQUESTERS.jennifer.email)
    await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
    await expect(page.getByTestId('current-user')).toContainText('Jennifer Anderson')
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change Requester' })).toHaveCount(0)
  })
})
