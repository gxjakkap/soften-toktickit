import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AttachmentSection from '../../src/AttachmentSection'
import type { Attachment } from '../../src/types'

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

const activeAttachment: Attachment = {
  id: 501,
  ticketId: 101,
  originalFileName: 'battery-report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 812345,
  uploadedAt: '2026-09-01T09:15:00.000Z',
  isRemoved: false,
}

const removedAttachment: Attachment = {
  id: 502,
  ticketId: 101,
  originalFileName: 'screenshot.png',
  mimeType: 'image/png',
  sizeBytes: 245000,
  uploadedAt: '2026-08-30T10:00:00.000Z',
  isRemoved: true,
  removedAt: '2026-08-31T08:00:00.000Z',
}

function makeFiveActive(): Attachment[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: 600 + i,
    ticketId: 101,
    originalFileName: `file-${i}.png`,
    mimeType: 'image/png',
    sizeBytes: 1024,
    uploadedAt: '2026-09-01T09:15:00.000Z',
    isRemoved: false,
  }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-15 (AC-14, AC-15): active vs removed attachment presentation', () => {
  it('shows a Download action for an active attachment and none for a removed one', () => {
    render(
      <AttachmentSection requesterId={7} ticketId={101} initialAttachments={[activeAttachment, removedAttachment]} />,
    )

    const activeRow = screen.getByText(/battery-report\.pdf/).closest('li')!
    expect(within(activeRow).getByRole('link', { name: /download/i })).toBeTruthy()

    const removedRow = screen.getByText(/screenshot\.png/).closest('li')!
    expect(within(removedRow).queryByRole('link', { name: /download/i })).toBeNull()
    expect(within(removedRow).getByText(/removed/i)).toBeTruthy()
  })

  it('does not offer a Remove action for an already-removed attachment', () => {
    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={[removedAttachment]} />)

    const removedRow = screen.getByText(/screenshot\.png/).closest('li')!
    expect(within(removedRow).queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('points the Download link at the attachment download endpoint with the current requesterId', () => {
    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={[activeAttachment]} />)

    const link = screen.getByRole('link', { name: /download/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/api/attachments/501/download?requesterId=7')
  })
})

describe('UI-16 (AC-10): upload control at the 5-active-attachment cap', () => {
  it('disables the upload control and explains the limit once 5 active attachments exist', () => {
    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={makeFiveActive()} />)

    expect(screen.getByText(/5-attachment limit reached/i)).toBeTruthy()
    const dropzone = screen.getByTestId('attachment-dropzone')
    expect(dropzone.getAttribute('aria-disabled')).toBe('true')
  })

  it('does not count a removed attachment toward the 5-active cap', () => {
    render(
      <AttachmentSection
        requesterId={7}
        ticketId={101}
        initialAttachments={[...makeFiveActive().slice(0, 4), removedAttachment]}
      />,
    )

    expect(screen.queryByText(/5-attachment limit reached/i)).toBeNull()
    const dropzone = screen.getByTestId('attachment-dropzone')
    expect(dropzone.getAttribute('aria-disabled')).not.toBe('true')
  })
})

describe('AttachmentSection: uploading a new file', () => {
  it('adds an uploaded file to the active attachment list on success', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (/^\/api\/tickets\/101\/attachments$/.test(url) && options?.method === 'POST') {
        return jsonResponse({
          id: 900,
          ticketId: 101,
          originalFileName: 'receipt.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          uploadedAt: '2026-09-02T09:16:00.000Z',
          isRemoved: false,
        })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={[]} />)

    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/attachments/i), file)

    expect(await screen.findByText(/receipt\.jpg/)).toBeTruthy()
  })

  it('rejects an oversized file client-side without calling the upload API', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(() => Promise.reject(new Error('should not be called')))
    vi.stubGlobal('fetch', fetchMock)

    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={[]} />)

    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText(/attachments/i), bigFile)

    expect(await screen.findByText(/exceeds the 5 mb limit/i)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a per-file error with Retry when the server rejects the upload', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (/^\/api\/tickets\/101\/attachments$/.test(url) && options?.method === 'POST') {
        attempts += 1
        if (attempts === 1) {
          return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Upload failed. Please retry.' } }, 500)
        }
        return jsonResponse({
          id: 901,
          ticketId: 101,
          originalFileName: 'receipt.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          uploadedAt: '2026-09-02T09:16:00.000Z',
          isRemoved: false,
        })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={[]} />)

    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/attachments/i), file)

    expect(await screen.findByText(/upload failed/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(screen.queryByText(/upload failed/i)).toBeNull())
    expect(attempts).toBe(2)
  })
})

describe('AttachmentSection: removing an attachment with confirmation', () => {
  it('opens a confirmation dialog with an optional reason before soft-removing', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/attachments/501/remove' && options?.method === 'PATCH') {
        const body = JSON.parse(String(options.body))
        return jsonResponse({ ...activeAttachment, isRemoved: true, removedAt: '2026-09-03T00:00:00.000Z', removedReason: body.reason || null })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={[activeAttachment]} />)

    await user.click(screen.getByRole('button', { name: /remove/i }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/reason/i), 'Wrong file')
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText(/removed/i)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/attachments/501/remove',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('does not remove the attachment when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(() => Promise.reject(new Error('should not be called')))
    vi.stubGlobal('fetch', fetchMock)

    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={[activeAttachment]} />)

    await user.click(screen.getByRole('button', { name: /remove/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/removed/i)).toBeNull()
  })
})

describe('AttachmentSection: loading/empty states', () => {
  it('shows an empty-state message when there are no attachments', () => {
    render(<AttachmentSection requesterId={7} ticketId={101} initialAttachments={[]} />)

    expect(screen.getByText(/no attachments/i)).toBeTruthy()
  })
})
