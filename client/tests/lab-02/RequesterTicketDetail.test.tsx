import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RequesterTicketDetail from '../../src/RequesterTicketDetail'
import { REQUESTER_STORAGE_KEY, RequesterProvider } from '../../src/RequesterContext'

const requester = { id: 7, name: 'Priya Shah', email: 'priya.shah@example.com' }

const ticketDetail = {
  id: 101,
  ticketNumber: 'TKT-2026-000101',
  requester: { id: 7, name: 'Priya Shah' },
  category: { id: 2, name: 'Hardware' },
  relatedSystem: { id: 5, name: 'Corporate Laptop' },
  requestedPriority: 'MEDIUM',
  summary: 'Laptop battery drains quickly',
  description: 'My laptop battery is draining much faster than usual even when idle.',
  currentStatus: 'NEW',
  createdAt: '2026-09-01T09:14:00.000Z',
  updatedAt: '2026-09-01T09:14:00.000Z',
  attachments: [
    {
      id: 501,
      ticketId: 101,
      originalFileName: 'battery-report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 812345,
      uploadedAt: '2026-09-01T09:15:00.000Z',
      isRemoved: false,
    },
  ],
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function renderDetail(ticketId = 101) {
  localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(requester))
  return render(
    <MemoryRouter initialEntries={[`/tickets/${ticketId}`]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('UI-14 (AC-24): read-only rendering', () => {
  it('renders all Ticket fields read-only with no Comment/Status/IT Priority controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/tickets/101?requesterId=7') return jsonResponse(ticketDetail)
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      }),
    )
    renderDetail()

    expect(await screen.findByText('TKT-2026-000101')).toBeTruthy()
    expect(screen.getByText('Hardware')).toBeTruthy()
    expect(screen.getByText('Corporate Laptop')).toBeTruthy()
    expect(screen.getByText('Priya Shah')).toBeTruthy()
    expect(screen.getByText(/laptop battery drains quickly/i)).toBeTruthy()
    expect(screen.getByText(/draining much faster/i)).toBeTruthy()

    // No editable form controls anywhere on the screen (BR nothing is
    // editable on this page), and none of the out-of-scope features render.
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/public comment/i)).toBeNull()
    expect(screen.queryByText(/internal note/i)).toBeNull()
    expect(screen.queryByText(/actions taken/i)).toBeNull()
    expect(screen.queryByText(/it priority/i)).toBeNull()
    expect(screen.queryByText(/ticket owner/i)).toBeNull()
    expect(screen.queryByLabelText(/status/i)).toBeNull()
  })

  it('shows the attachment section with the ticket’s attachments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/tickets/101?requesterId=7') return jsonResponse(ticketDetail)
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      }),
    )
    renderDetail()

    expect(await screen.findByText(/battery-report\.pdf/)).toBeTruthy()
  })
})

describe('RequesterTicketDetail: loading state', () => {
  it('shows a loading indicator before the ticket resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderDetail()

    expect(screen.getByText(/loading/i)).toBeTruthy()
  })
})

describe('RequesterTicketDetail: not-found / ownership failure (AC-03)', () => {
  it('shows a safe not-found message when the API returns 404, revealing nothing about the ticket', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } }, 404)),
    )
    renderDetail()

    expect(await screen.findByText(/ticket not found/i)).toBeTruthy()
    expect(screen.queryByText('TKT-2026-000101')).toBeNull()
  })
})

describe('RequesterTicketDetail: API failure state', () => {
  it('shows a safe error banner with a retry action on a server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }, 500)),
    )
    renderDetail()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })
})

describe('RequesterTicketDetail: empty attachments state', () => {
  it('shows a no-attachments message when the ticket has none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/tickets/101?requesterId=7') return jsonResponse({ ...ticketDetail, attachments: [] })
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      }),
    )
    renderDetail()

    expect(await screen.findByText(/no attachments/i)).toBeTruthy()
  })
})

describe('RequesterTicketDetail: badges', () => {
  it('shows the Requested Priority and Current Status as labeled badges', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/tickets/101?requesterId=7') return jsonResponse(ticketDetail)
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      }),
    )
    renderDetail()

    const priority = await screen.findByTestId('priority-badge')
    expect(within(priority).getByText(/medium/i)).toBeTruthy()
    const status = screen.getByTestId('status-badge')
    expect(within(status).getByText(/new/i)).toBeTruthy()
  })
})
