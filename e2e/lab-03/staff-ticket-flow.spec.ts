import { expect, test } from '@playwright/test'
import {
  createTicketViaApi,
  loginViaApi,
  loginViaUi,
  REQUESTERS,
  SEED_PASSWORD,
} from '../lab-02/helpers'

// specification.md §6, ui-spec.md §6, api-spec.md §4: the IT Staff Ticket
// Queue and Ticket Detail operational flow end to end — search, open, claim,
// IT Priority, Current Status, Public Comment, Internal Note — and the
// BR-04/BR-29 visibility boundary from the Requester's side.

const STAFF = { name: 'Sarah Johnson', email: 'sarah.johnson@example.com' }

test('IT Staff finds, claims, triages and annotates a Ticket; the Requester sees the comment but not the note', async ({
  page,
  context,
}) => {
  const summary = `Staff flow fixture ${Date.now()}`
  await loginViaApi(context.request, REQUESTERS.jennifer.email)
  const ticket = await createTicketViaApi(context.request, { summary })

  await loginViaUi(page, STAFF.email, SEED_PASSWORD, '**/staff/tickets')

  // FR-12/AC-22: search the shared Queue by Ticket Number.
  await page.getByPlaceholder(/search by ticket number or summary/i).fill(ticket.ticketNumber)
  await expect(page.getByRole('link', { name: ticket.ticketNumber })).toBeVisible()

  // FR-13: open the full detail.
  await page.getByRole('link', { name: ticket.ticketNumber }).click()
  await expect(page.getByRole('heading', { name: summary })).toBeVisible()

  // FR-14: claim the unassigned Ticket.
  await page.getByRole('button', { name: 'Claim' }).click()
  await expect(page.getByRole('combobox', { name: /ticket owner/i })).toHaveValue(/\d+/)

  // FR-16/BR-21: set IT Priority, independent of Requested Priority.
  await page.getByRole('combobox', { name: /it priority/i }).selectOption('HIGH')
  await expect(page.getByRole('combobox', { name: /it priority/i })).toHaveValue('HIGH')

  // FR-17/BR-22: a permitted transition (New -> Open, specification.md §7).
  await page.getByRole('combobox', { name: /current status/i }).selectOption('OPEN')
  await expect(page.getByRole('combobox', { name: /current status/i })).toHaveValue('OPEN')

  // FR-18: Public Comment, visible to the Requester.
  const commentText = `Looking into this now ${Date.now()}.`
  await page.getByLabel(/add a comment/i).fill(commentText)
  await page.getByRole('button', { name: 'Post Comment' }).click()
  await expect(page.getByText(commentText)).toBeVisible()

  // FR-19/BR-04/BR-29: Internal Note, never visible to the Requester.
  const noteText = `Escalating to hardware vendor internally ${Date.now()}.`
  await page.getByLabel(/add an internal note/i).fill(noteText)
  await page.getByRole('button', { name: 'Post Internal Note' }).click()
  await expect(page.getByText(noteText)).toBeVisible()

  // Switch to the Requester who filed it and confirm the visibility split.
  await loginViaUi(page, REQUESTERS.jennifer.email)
  await page.goto(`/tickets/${ticket.id}`)
  await expect(page.getByText(commentText)).toBeVisible()
  await expect(page.getByText(noteText)).toHaveCount(0)
})
