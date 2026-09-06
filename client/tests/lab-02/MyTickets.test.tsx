import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { REQUESTER_STORAGE_KEY, RequesterProvider } from '../../src/RequesterContext'
import type { TicketListItem, TicketListResponse } from '../../src/types'

// UI-10..13 (AC-16, AC-18, AC-19, AC-20; BR-30).

const requester = { id: 7, name: 'Priya Shah', email: 'priya.shah@example.com' }

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function ticket(overrides: Partial<TicketListItem> = {}): TicketListItem {
  return {
    id: 1,
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    categoryId: 1,
    categoryName: 'Hardware',
    requestedPriority: 'MEDIUM',
    currentStatus: 'NEW',
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  }
}

function mockApi(ticketsHandler: (url: URL) => TicketListResponse) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/categories') return jsonResponse([{ id: 1, name: 'Hardware' }, { id: 2, name: 'Software' }])
    if (url === '/api/related-systems') return jsonResponse([{ id: 5, name: 'Corporate Laptop' }])
    if (url.startsWith('/api/tickets?')) {
      return jsonResponse(ticketsHandler(new URL(url, 'http://localhost')))
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderMyTickets() {
  localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(requester))
  return render(
    <MemoryRouter initialEntries={['/tickets']}>
      <RequesterProvider>
        <AppRoutes />
      </RequesterProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('My Tickets states', () => {
  it('UI-10 (AC-20, BR-30): shows the empty-account state, not filters, when the Requester owns zero Tickets', async () => {
    mockApi(() => ({ data: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasAnyTickets: false }))
    renderMyTickets()

    expect(await screen.findByText(/haven.t created any tickets yet/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /create your first ticket/i })).toBeTruthy()
    expect(screen.queryByPlaceholderText(/search by ticket number or summary/i)).toBeNull()
  })

  it('UI-11 (AC-19, BR-30): shows the no-results state with Clear Filters, distinct from the empty state', async () => {
    mockApi(() => ({ data: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasAnyTickets: true }))
    renderMyTickets()

    expect(await screen.findByText(/no tickets match your filters/i)).toBeTruthy()
    expect(screen.queryByText(/haven.t created any tickets yet/i)).toBeNull()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeTruthy()
    // Filters stay visible/interactive in the no-results state (ui-spec §11.3).
    expect(screen.getByPlaceholderText(/search by ticket number or summary/i)).toBeTruthy()
  })

  it('UI-12 (AC-18): pagination shows the correct "Showing X to Y of Z" text and Next loads page 2', async () => {
    const fetchMock = mockApi((url) => {
      const page = Number(url.searchParams.get('page') ?? '1')
      if (page === 2) {
        return {
          data: [ticket({ id: 2, ticketNumber: 'TKT-2026-000002', summary: 'Second page ticket' })],
          page: 2,
          pageSize: 10,
          totalCount: 11,
          totalPages: 2,
          hasAnyTickets: true,
        }
      }
      return {
        data: Array.from({ length: 10 }, (_, i) =>
          ticket({ id: i + 1, ticketNumber: `TKT-2026-00000${i + 1}`, summary: `Ticket ${i + 1}` }),
        ),
        page: 1,
        pageSize: 10,
        totalCount: 11,
        totalPages: 2,
        hasAnyTickets: true,
      }
    })
    renderMyTickets()

    expect(await screen.findByText(/showing 1 to 10 of 11 tickets/i)).toBeTruthy()
    const previousButton = screen.getByRole('button', { name: /^previous$/i }) as HTMLButtonElement
    expect(previousButton.disabled).toBe(true)

    // ui-spec.md §11.3: pagination shows page numbers, not just Previous/Next.
    const pageNav = screen.getByRole('navigation', { name: /pagination/i })
    const pageOneButton = within(pageNav).getByRole('button', { name: '1' })
    expect(pageOneButton.getAttribute('aria-current')).toBe('page')
    const pageTwoButton = within(pageNav).getByRole('button', { name: '2' })

    const user = userEvent.setup()
    await user.click(pageTwoButton)

    expect(await screen.findByText(/showing 11 to 11 of 11 tickets/i)).toBeTruthy()
    expect(within(screen.getByTestId('tickets-table')).getByText('Second page ticket')).toBeTruthy()
    expect(within(screen.getByRole('navigation', { name: /pagination/i })).getByRole('button', { name: '2' }).getAttribute('aria-current')).toBe('page')
    const calls = fetchMock.mock.calls
    const lastCall = calls[calls.length - 1][0] as string
    expect(new URL(lastCall, 'http://localhost').searchParams.get('page')).toBe('2')
  })

  it('UI-13 (AC-16): typing a search term narrows the list', async () => {
    mockApi((url) => {
      const search = url.searchParams.get('search')
      if (search === 'vpn') {
        return {
          data: [ticket({ id: 3, ticketNumber: 'TKT-2026-000003', summary: 'VPN connection drops' })],
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
          hasAnyTickets: true,
        }
      }
      return {
        data: [
          ticket({ id: 1, summary: 'Laptop battery drains quickly' }),
          ticket({ id: 4, ticketNumber: 'TKT-2026-000004', summary: 'Printer offline' }),
        ],
        page: 1,
        pageSize: 10,
        totalCount: 2,
        totalPages: 1,
        hasAnyTickets: true,
      }
    })
    renderMyTickets()

    await screen.findByTestId('tickets-table')
    const table = () => within(screen.getByTestId('tickets-table'))
    table().getByText('Laptop battery drains quickly')

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/search by ticket number or summary/i), 'vpn')

    await waitFor(() => expect(table().getByText('VPN connection drops')).toBeTruthy())
    expect(table().queryByText('Printer offline')).toBeNull()
  })
})
