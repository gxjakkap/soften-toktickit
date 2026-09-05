import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { REQUESTER_STORAGE_KEY, RequesterProvider } from '../../src/RequesterContext'

const requester = { id: 7, name: 'Priya Shah', email: 'priya.shah@example.com' }
const categories = [
  { id: 1, name: 'Hardware' },
  { id: 2, name: 'Software' },
]
const relatedSystems = [
  { id: 5, name: 'Corporate Laptop' },
  { id: 6, name: 'VPN' },
]

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function mockApi(overrides: {
  createTicketStatus?: number
  createTicketBody?: unknown
  onCreateTicket?: (body: unknown) => void
  attachmentStatus?: number
  attachmentBody?: unknown
} = {}) {
  const fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (url === '/api/categories') return jsonResponse(categories)
    if (url === '/api/related-systems') return jsonResponse(relatedSystems)
    if (url === '/api/tickets' && options?.method === 'POST') {
      overrides.onCreateTicket?.(JSON.parse(String(options.body)))
      return jsonResponse(
        overrides.createTicketBody ?? {
          id: 101,
          ticketNumber: 'TKT-2026-000101',
          requesterId: requester.id,
          categoryId: 1,
          relatedSystemId: 5,
          requestedPriority: 'MEDIUM',
          summary: 'Laptop battery drains quickly',
          description: 'My laptop battery drains much faster than usual even when idle.',
          currentStatus: 'NEW',
          createdAt: '2026-09-01T09:14:00.000Z',
          updatedAt: '2026-09-01T09:14:00.000Z',
        },
        overrides.createTicketStatus ?? 201,
      )
    }
    if (/^\/api\/tickets\/\d+\/attachments$/.test(url) && options?.method === 'POST') {
      return jsonResponse(
        overrides.attachmentBody ?? {
          id: 501,
          ticketId: 101,
          originalFileName: 'receipt.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          uploadedAt: '2026-09-01T09:16:00.000Z',
          isRemoved: false,
        },
        overrides.attachmentStatus ?? 201,
      )
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderCreateTicket() {
  localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(requester))
  return render(
    <MemoryRouter initialEntries={['/tickets/new']}>
      <RequesterProvider>
        <AppRoutes />
      </RequesterProvider>
    </MemoryRouter>,
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText(/category/i), '1')
  await user.selectOptions(screen.getByLabelText(/related system/i), '5')
  await user.selectOptions(screen.getByLabelText(/requested priority/i), 'MEDIUM')
  await user.type(screen.getByLabelText(/^summary/i), 'Laptop battery drains quickly')
  await user.type(screen.getByLabelText(/^description/i), 'My laptop battery drains much faster than usual now.')
}

function submitButton() {
  return screen.getByRole('button', { name: /^submit$/i }) as HTMLButtonElement
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('Create Ticket initial state', () => {
  it('shows read-only system-generated fields pre-filled/placeholder, distinct from editable fields', async () => {
    mockApi()
    renderCreateTicket()

    const ticketNumber = (await screen.findByLabelText(/ticket number/i)) as HTMLInputElement
    const ticketDate = screen.getByLabelText(/ticket date/i) as HTMLInputElement
    const requesterField = screen.getByLabelText(/^requester$/i) as HTMLInputElement

    expect(ticketNumber.value).toMatch(/generated after submission/i)
    expect(ticketDate.value).toMatch(/generated after submission/i)
    expect(requesterField.value).toBe(requester.name)
    expect(ticketNumber.readOnly).toBe(true)
    expect(ticketDate.readOnly).toBe(true)
    expect(requesterField.readOnly).toBe(true)
    expect(ticketNumber.className).toMatch(/zg-field-readonly/)
    // Read-only is a distinct state from Disabled (ui-spec.md §3) — these
    // fields must not also carry the disabled look.
    expect(ticketNumber.disabled).toBe(false)
    expect(ticketDate.disabled).toBe(false)
    expect(requesterField.disabled).toBe(false)
  })

  it('populates Category and Related System from the reference-data APIs', async () => {
    mockApi()
    renderCreateTicket()

    const category = await screen.findByLabelText(/category/i)
    expect(within(category).getByText('Hardware')).toBeTruthy()
    expect(within(category).getByText('Software')).toBeTruthy()

    const relatedSystem = screen.getByLabelText(/related system/i)
    expect(within(relatedSystem).getByText('Corporate Laptop')).toBeTruthy()
    expect(within(relatedSystem).getByText('VPN')).toBeTruthy()
  })

  it('marks every required field with a visible asterisk before any submit attempt', async () => {
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const requiredLabels = ['Category', 'Related System', 'Requested Priority', 'Summary', 'Description']
    for (const text of requiredLabels) {
      const label = screen.getByText(new RegExp(`^${text}`, 'i'))
      expect(within(label).getByText('*')).toBeTruthy()
    }
  })
})

describe('UI-05 (AC-04, AC-26): blank Summary', () => {
  it('shows a field-level error directly under Summary and never calls the create API', async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi()
    renderCreateTicket()

    await user.selectOptions(await screen.findByLabelText(/category/i), '1')
    await user.selectOptions(screen.getByLabelText(/related system/i), '5')
    await user.selectOptions(screen.getByLabelText(/requested priority/i), 'MEDIUM')
    await user.type(screen.getByLabelText(/^description/i), 'My laptop battery drains much faster than usual now.')
    await user.click(submitButton())

    const summaryField = screen.getByLabelText(/^summary/i)
    const error = await screen.findByText(/summary is required/i)
    expect(summaryField.closest('div')?.contains(error) || error.previousElementSibling === summaryField).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/tickets', expect.objectContaining({ method: 'POST' }))
  })

  it('clears the error once the Requester fills the field in, without a second submit', async () => {
    const user = userEvent.setup()
    mockApi()
    renderCreateTicket()

    await user.click(submitButton())
    await screen.findByText(/summary is required/i)

    await user.type(screen.getByLabelText(/^summary/i), 'Laptop battery drains quickly')

    expect(screen.queryByText(/summary is required/i)).toBeNull()
  })
})

describe('AC-05: Description under 10 characters', () => {
  it('shows a field-level error under Description and does not call the create API', async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi()
    renderCreateTicket()

    await user.selectOptions(await screen.findByLabelText(/category/i), '1')
    await user.selectOptions(screen.getByLabelText(/related system/i), '5')
    await user.selectOptions(screen.getByLabelText(/requested priority/i), 'MEDIUM')
    await user.type(screen.getByLabelText(/^summary/i), 'Laptop battery drains quickly')
    await user.type(screen.getByLabelText(/^description/i), 'too short')
    await user.click(submitButton())

    expect(await screen.findByText(/description must be at least 10 characters/i)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/tickets', expect.objectContaining({ method: 'POST' }))
  })
})

describe('AC-06: no Requested Priority chosen', () => {
  it('shows a field-level error under Requested Priority and does not call the create API', async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi()
    renderCreateTicket()

    await user.selectOptions(await screen.findByLabelText(/category/i), '1')
    await user.selectOptions(screen.getByLabelText(/related system/i), '5')
    await user.type(screen.getByLabelText(/^summary/i), 'Laptop battery drains quickly')
    await user.type(screen.getByLabelText(/^description/i), 'My laptop battery drains much faster than usual now.')
    await user.click(submitButton())

    expect(await screen.findByText(/requested priority is required/i)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/tickets', expect.objectContaining({ method: 'POST' }))
  })

  it('has no priority pre-selected', async () => {
    mockApi()
    renderCreateTicket()
    const priority = (await screen.findByLabelText(/requested priority/i)) as HTMLSelectElement
    expect(priority.value).toBe('')
  })
})

describe('UI-06 (AC-07): double-submit', () => {
  it('shows a busy/disabled Submit and only one Ticket is created', async () => {
    const user = userEvent.setup()
    let resolveCreate: (() => void) | undefined
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/categories') return jsonResponse(categories)
      if (url === '/api/related-systems') return jsonResponse(relatedSystems)
      if (url === '/api/tickets' && options?.method === 'POST') {
        return new Promise((resolve) => {
          resolveCreate = () =>
            resolve(
              new Response(
                JSON.stringify({
                  id: 101,
                  ticketNumber: 'TKT-2026-000101',
                  requesterId: requester.id,
                  categoryId: 1,
                  relatedSystemId: 5,
                  requestedPriority: 'MEDIUM',
                  summary: 'Laptop battery drains quickly',
                  description: 'My laptop battery drains much faster than usual now.',
                  currentStatus: 'NEW',
                  createdAt: '2026-09-01T09:14:00.000Z',
                  updatedAt: '2026-09-01T09:14:00.000Z',
                }),
                { status: 201 },
              ),
            )
        })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderCreateTicket()

    await fillValidForm(user)
    const button = submitButton()
    await user.click(button)
    expect(button.disabled).toBe(true)
    expect(button.textContent).toMatch(/submitting/i)

    await user.click(button)
    resolveCreate?.()

    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/tickets')).toHaveLength(1))
  })
})

describe('UI-07 (AC-08): server failure preserves entered values', () => {
  it('shows a safe error message and keeps the form values, creating nothing', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/categories') return jsonResponse(categories)
      if (url === '/api/related-systems') return jsonResponse(relatedSystems)
      if (url === '/api/tickets' && options?.method === 'POST') {
        return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }, 500)
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderCreateTicket()

    await fillValidForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByLabelText(/^summary/i) as HTMLInputElement).value).toBe('Laptop battery drains quickly')
    expect((screen.getByLabelText(/^description/i) as HTMLTextAreaElement).value).toBe(
      'My laptop battery drains much faster than usual now.',
    )
    expect(submitButton().disabled).toBe(false)
  })
})

describe('UI-08 (AC-01): success', () => {
  it('shows the generated Ticket Number after a successful submit', async () => {
    const user = userEvent.setup()
    mockApi()
    renderCreateTicket()

    await fillValidForm(user)
    await user.click(submitButton())

    expect(await screen.findByText(/tkt-2026-000101/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /view ticket/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /create another/i })).toBeTruthy()
  })

  it('resets to a blank form on Create Another', async () => {
    const user = userEvent.setup()
    mockApi()
    renderCreateTicket()

    await fillValidForm(user)
    await user.click(submitButton())
    await screen.findByText(/tkt-2026-000101/i)

    await user.click(screen.getByRole('button', { name: /create another/i }))

    expect((screen.getByLabelText(/^summary/i) as HTMLInputElement).value).toBe('')
    expect(screen.queryByText(/tkt-2026-000101/i)).toBeNull()
  })
})

describe('UI-09 (AC-11): oversized file, client-side', () => {
  it('rejects a 6MB file before any upload request fires', async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement
    await user.upload(input, bigFile)

    expect(await screen.findByText(/exceeds the 5 mb limit/i)).toBeTruthy()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/attachments'))).toBe(false)
  })
})

describe('AC-12: unsupported file type, client-side', () => {
  it('rejects a .exe file before any upload request fires', async () => {
    // The input's accept attribute is a picker-dialog hint, not a hard
    // browser restriction (drag/drop and "All files" can still bypass it) —
    // disable user-event's accept-based filtering to exercise the actual
    // JS-side rejection path this test targets.
    const user = userEvent.setup({ applyAccept: false })
    const fetchMock = mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const badFile = new File(['x'], 'virus.exe', { type: 'application/x-msdownload' })
    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement
    await user.upload(input, badFile)

    expect(await screen.findByText(/unsupported file type/i)).toBeTruthy()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/attachments'))).toBe(false)
  })
})

describe('AC-10: attachment count cap on Create Ticket', () => {
  it('rejects a 6th selected file with a limit-reached message', async () => {
    const user = userEvent.setup()
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement
    const files = Array.from({ length: 5 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }))
    await user.upload(input, files)
    const sixth = new File(['x'], 'f5.png', { type: 'image/png' })
    await user.upload(input, sixth)

    expect(await screen.findByText(/at most 5 attachments/i)).toBeTruthy()
  })
})

describe('Attachments dropzone: click/keyboard opens the file browser', () => {
  it('clicking the dropzone opens the (now hidden) native file input', async () => {
    const user = userEvent.setup()
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    await user.click(screen.getByTestId('attachment-dropzone'))

    expect(clickSpy).toHaveBeenCalled()
  })

  it('pressing Enter while the dropzone is focused opens the file browser', async () => {
    const user = userEvent.setup()
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')
    const dropzone = screen.getByTestId('attachment-dropzone')

    dropzone.focus()
    await user.keyboard('{Enter}')

    expect(clickSpy).toHaveBeenCalled()
  })

  it('is keyboard-reachable via Tab and exposes an accessible name', async () => {
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const dropzone = screen.getByRole('button', { name: /attach files/i })
    expect(dropzone.tabIndex).toBe(0)
  })
})

describe('Attachments dropzone: drag and drop', () => {
  it('adds a valid file dropped onto the dropzone', async () => {
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const dropzone = screen.getByTestId('attachment-dropzone')
    const file = new File(['x'], 'photo.png', { type: 'image/png' })

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })

    expect(await screen.findByText(/photo\.png/i)).toBeTruthy()
  })

  it('shows a dragover visual state while dragging and clears it on drop', async () => {
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const dropzone = screen.getByTestId('attachment-dropzone');
    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } })
    expect(dropzone.className).toMatch(/is-dragover/)

    fireEvent.drop(dropzone, { dataTransfer: { files: [] } })
    expect(dropzone.className).not.toMatch(/is-dragover/)
  })

  it('rejects an oversized dropped file with the same client-side message as file-picker uploads', async () => {
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const dropzone = screen.getByTestId('attachment-dropzone')
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })

    fireEvent.drop(dropzone, { dataTransfer: { files: [bigFile] } })

    expect(await screen.findByText(/exceeds the 5 mb limit/i)).toBeTruthy()
  })
})

describe('Attachments: paste an image from the clipboard', () => {
  it('adds a pasted image to the attachment list', async () => {
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const pastedFile = new File(['x'], 'clipboard.png', { type: 'image/png' })
    const clipboardItem = { kind: 'file', type: 'image/png', getAsFile: () => pastedFile }
    fireEvent.paste(document, { clipboardData: { items: [clipboardItem] } })

    expect(await screen.findByText(/clipboard\.png/i)).toBeTruthy()
  })

  it('synthesizes a filename with the right extension for a nameless clipboard image', async () => {
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const pastedFile = new File(['x'], '', { type: 'image/png' })
    const clipboardItem = { kind: 'file', type: 'image/png', getAsFile: () => pastedFile }
    fireEvent.paste(document, { clipboardData: { items: [clipboardItem] } })

    expect(await screen.findByText(/pasted-image.*\.png/i)).toBeTruthy()
  })

  it('ignores a plain-text paste (e.g. into Summary) and does not touch attachments', async () => {
    const user = userEvent.setup()
    mockApi()
    renderCreateTicket()
    await screen.findByLabelText(/category/i)

    await user.click(screen.getByLabelText(/^summary/i))
    fireEvent.paste(screen.getByLabelText(/^summary/i), { clipboardData: { items: [] } })

    expect(screen.queryByTestId('attachment-list')).toBeNull()
  })
})

describe('inline attachment retry after Ticket creation', () => {
  it('shows a per-file error with an inline Retry that re-attempts the same upload', async () => {
    const user = userEvent.setup()
    let attachmentAttempts = 0
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/categories') return jsonResponse(categories)
      if (url === '/api/related-systems') return jsonResponse(relatedSystems)
      if (url === '/api/tickets' && options?.method === 'POST') {
        return jsonResponse({
          id: 101,
          ticketNumber: 'TKT-2026-000101',
          requesterId: requester.id,
          categoryId: 1,
          relatedSystemId: 5,
          requestedPriority: 'MEDIUM',
          summary: 'x',
          description: 'x',
          currentStatus: 'NEW',
          createdAt: '2026-09-01T09:14:00.000Z',
          updatedAt: '2026-09-01T09:14:00.000Z',
        })
      }
      if (/^\/api\/tickets\/\d+\/attachments$/.test(url) && options?.method === 'POST') {
        attachmentAttempts += 1
        if (attachmentAttempts === 1) {
          return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Upload failed. Please retry.' } }, 500)
        }
        return jsonResponse(
          {
            id: 501,
            ticketId: 101,
            originalFileName: 'receipt.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
            uploadedAt: '2026-09-01T09:16:00.000Z',
            isRemoved: false,
          },
          201,
        )
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderCreateTicket()

    await fillValidForm(user)
    const goodFile = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/attachments/i), goodFile)
    await user.click(submitButton())

    await screen.findByText(/tkt-2026-000101/i)
    expect(await screen.findByText(/upload failed/i)).toBeTruthy()
    const retryButton = screen.getByRole('button', { name: /retry/i })

    await user.click(retryButton)

    await waitFor(() => expect(screen.queryByText(/upload failed/i)).toBeNull())
    expect(attachmentAttempts).toBe(2)
  })
})

describe('STYLE-01: field state CSS classes', () => {
  it('applies read-only, editable, invalid, and busy classes as appropriate', async () => {
    const user = userEvent.setup()
    mockApi()
    renderCreateTicket()

    const ticketNumber = (await screen.findByLabelText(/ticket number/i)) as HTMLInputElement
    expect(ticketNumber.className).toMatch(/zg-field-readonly/)
    expect(ticketNumber.disabled).toBe(false)

    const summary = screen.getByLabelText(/^summary/i)
    expect(summary.className).toMatch(/zg-field/)
    expect(summary.className).not.toMatch(/zg-field-invalid/)

    await user.click(submitButton())
    expect(await screen.findByLabelText(/^summary/i)).toHaveProperty(
      'className',
      expect.stringMatching(/zg-field-invalid/),
    )

    await fillValidForm(user)
    const button = submitButton()
    await user.click(button)
    expect(button.className).toMatch(/zg-btn-primary/)
    expect(button.disabled).toBe(true)
  })
})
