import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  createTicketViaApi,
  findRequester,
  loginViaStorage,
  loginViaUi,
  REQUESTERS,
  waitForCreateTicketReady,
} from './helpers'

const PHOTO_FIXTURE = path.join(__dirname, 'fixtures/valid-photo.png')

test.describe('E2E-01 (AC-01, AC-09, AC-16, AC-24): create -> find -> open', () => {
  test('selecting a Requester, creating a Ticket with an attachment, finding it by search, and opening its detail all agree', async ({
    page,
  }) => {
    const jennifer = await findRequester(page.context().request, REQUESTERS.jennifer.email)
    await loginViaUi(page, jennifer)

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Create Ticket' }).click()
    await page.waitForURL('**/tickets/new')

    await waitForCreateTicketReady(page)
    await page.getByLabel('Category').selectOption({ index: 1 })
    await page.getByLabel('Related System').selectOption({ index: 1 })
    await page.getByLabel('Requested Priority').selectOption('HIGH')
    const summary = `VPN connection keeps dropping ${Date.now()}`
    await page.getByLabel('Summary').fill(summary)
    await page
      .getByLabel('Description')
      .fill('The VPN client disconnects every few minutes while connected to the campus network.')

    await page.getByTestId('attachment-dropzone').click()
    await page.locator('#attachments').setInputFiles(PHOTO_FIXTURE)

    await page.getByRole('button', { name: 'Submit' }).click()

    const successBanner = page.getByRole('status')
    await expect(successBanner).toContainText(/Ticket created: TKT-\d{4}-\d{6}/)
    const ticketNumber = (await successBanner.textContent())!.match(/TKT-\d{4}-\d{6}/)![0]

    await page.getByRole('link', { name: 'View Ticket' }).click()
    await expect(page.getByRole('heading', { name: summary })).toBeVisible()
    await expect(page.getByText('valid-photo.png')).toBeVisible()

    await page.getByRole('link', { name: 'Back to My Tickets' }).click()
    await page.waitForURL('**/tickets')
    await page.getByLabel('Search').fill('vpn connection keeps dropping')
    await expect(page.getByRole('link', { name: ticketNumber })).toBeVisible()

    await page.getByRole('link', { name: ticketNumber }).click()
    await expect(page.getByRole('heading', { name: summary })).toBeVisible()
    await expect(page.getByText('Public Comments')).toHaveCount(0)
    await expect(page.getByText('Internal Notes')).toHaveCount(0)
  })
})

test.describe('E2E-02 (AC-03, AC-23): cross-Requester isolation', () => {
  test("Requester B never sees Requester A's ticket, in the list or by direct navigation", async ({
    page,
    request,
  }) => {
    const jennifer = await findRequester(request, REQUESTERS.jennifer.email)
    const michael = await findRequester(request, REQUESTERS.michael.email)

    const ownedByJennifer = await createTicketViaApi(request, jennifer.id, {
      summary: `Isolation fixture ${Date.now()}`,
    })

    await loginViaStorage(page, michael)
    await page.goto('/tickets')
    await expect(page.getByRole('link', { name: ownedByJennifer.ticketNumber })).toHaveCount(0)

    await page.goto(`/tickets/${ownedByJennifer.id}`)
    await expect(page.getByText('Ticket not found.')).toBeVisible()

    // AC-23: switching Requester clears the previous one's data from the app.
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Change Requester' }).click()
    await page.waitForURL('**/select-requester')
    const jenniferAgain = await findRequester(request, REQUESTERS.jennifer.email)
    await page.getByLabel(/development requester/i).selectOption(String(jenniferAgain.id))
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL('**/tickets')
    await expect(page.getByRole('link', { name: ownedByJennifer.ticketNumber })).toBeVisible()
  })
})

test.describe('E2E-03 (AC-14, AC-15): attachment lifecycle', () => {
  test('upload, download while active, soft-remove, then download fails safely', async ({ page, request }) => {
    const jennifer = await findRequester(request, REQUESTERS.jennifer.email)
    const ticket = await createTicketViaApi(request, jennifer.id, {
      summary: `Attachment lifecycle fixture ${Date.now()}`,
    })

    await loginViaStorage(page, jennifer)
    await page.goto(`/tickets/${ticket.id}`)

    await page.getByTestId('attachment-dropzone').click()
    await page.locator('#attachments').setInputFiles(PHOTO_FIXTURE)
    const row = page.locator('li.zg-attachment-row', { hasText: 'valid-photo.png' })
    await expect(row.getByRole('link', { name: 'Download' })).toBeVisible()

    const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('link', { name: 'Download' }).click()])
    expect(download.suggestedFilename()).toBe('valid-photo.png')

    await row.getByRole('button', { name: 'Remove' }).click()
    await page.getByLabel('Reason (optional)').fill('Duplicate upload, removing for the lifecycle test.')
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()

    await expect(row.getByText('Removed')).toBeVisible()
    await expect(row.getByRole('link', { name: 'Download' })).toHaveCount(0)

    const attachmentId = await page.evaluate(async ({ ticketId, requesterId }) => {
      const res = await fetch(`/api/tickets/${ticketId}?requesterId=${requesterId}`)
      const body = (await res.json()) as { attachments: { id: number; originalFileName: string }[] }
      return body.attachments.find((a) => a.originalFileName === 'valid-photo.png')!.id
    }, { ticketId: ticket.id, requesterId: jennifer.id })

    const blockedDownload = await request.get(
      `/api/attachments/${attachmentId}/download?requesterId=${jennifer.id}`,
    )
    expect(blockedDownload.status()).toBe(410)
  })
})
