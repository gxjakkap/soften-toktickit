import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testStaffUser, testUser } from '../helpers/auth'
import type { TicketQueueItem, TicketQueueResponse } from '../../src/types'

// ui-spec.md §5, api-spec.md §4.1 (FR-12, BR-31, BR-32, AC-22..26, AC-35,
// AC-37): the IT Staff Ticket Queue — rendering, search/filter/sort/
// pagination wiring, and every documented screen state.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function ticket(overrides: Partial<TicketQueueItem> = {}): TicketQueueItem {
  return {
    id: 1,
    ticketNumber: 'TKT-2026-000101',
    summary: 'Laptop battery drains quickly',
    categoryName: 'Hardware',
    requestedPriority: 'MEDIUM',
    itPriority: 'HIGH',
    currentStatus: 'IN_PROGRESS',
    ownerName: 'Michael Brown',
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-02T09:00:00.000Z',
    ...overrides,
  }
}

function mockApi(
  user: typeof testUser,
  queueHandler?: (url: URL) => TicketQueueResponse,
  queueStatus = 200,
) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return jsonResponse(user)
    if (url === '/api/categories')
      return jsonResponse([
        { id: 1, name: 'Hardware' },
        { id: 2, name: 'Software' },
      ])
    if (url.startsWith('/api/staff/tickets?') || url === '/api/staff/tickets') {
      if (!queueHandler) {
        return jsonResponse(
          { error: { code: 'FORBIDDEN', message: 'You do not have permission.' } },
          403,
        )
      }
      return jsonResponse(queueHandler(new URL(url, 'http://localhost')), queueStatus)
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Ticket Queue access', () => {
  it('AC-35: shows the forbidden state for a Requester, with no Queue request made', async () => {
    mockApi(testUser) // no queueHandler — any /api/staff/tickets call fails the test
    renderQueue()

    expect(await screen.findByTestId('queue-forbidden')).toBeTruthy()
    expect(screen.getByText(/you don.t have access to this page/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /back to your home page/i })).toBeTruthy()
  })

  it('AC-37: shows the forbidden state for an Administrator', async () => {
    mockApi({ ...testUser, role: 'ADMINISTRATOR' })
    renderQueue()

    expect(await screen.findByTestId('queue-forbidden')).toBeTruthy()
  })
})

describe('Ticket Queue states', () => {
  it('shows the empty-queue state, not filters, when zero Tickets exist system-wide', async () => {
    mockApi(testStaffUser, () => ({
      data: [],
      page: 1,
      pageSize: 10,
      totalCount: 0,
      totalPages: 0,
      hasAnyTickets: false,
    }))
    renderQueue()

    expect(await screen.findByText(/no tickets exist yet/i)).toBeTruthy()
    expect(screen.queryByPlaceholderText(/search by ticket number or summary/i)).toBeNull()
  })

  it('AC-25: shows the no-results state with Clear Filters, distinct from the empty state', async () => {
    mockApi(testStaffUser, () => ({
      data: [],
      page: 1,
      pageSize: 10,
      totalCount: 0,
      totalPages: 0,
      hasAnyTickets: true,
    }))
    renderQueue()

    expect(await screen.findByText(/no tickets match your filters/i)).toBeTruthy()
    expect(screen.queryByText(/no tickets exist yet/i)).toBeNull()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeTruthy()
    expect(screen.getByPlaceholderText(/search by ticket number or summary/i)).toBeTruthy()
  })

  it('shows a safe failure banner with retry on a server error', async () => {
    mockApi(
      testStaffUser,
      () => ({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected.' } }) as never,
      500,
    )
    renderQueue()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/unable to load the ticket queue/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('renders seeded data in both the desktop table and the mobile card list, with badges', async () => {
    mockApi(testStaffUser, () => ({
      data: [ticket()],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
      hasAnyTickets: true,
    }))
    renderQueue()

    const table = await screen.findByTestId('queue-table')
    expect(within(table).getByText('TKT-2026-000101')).toBeTruthy()
    expect(within(table).getByText('Michael Brown')).toBeTruthy()

    const cards = screen.getByTestId('queue-cards')
    expect(within(cards).getByText('TKT-2026-000101')).toBeTruthy()
    expect(within(cards).getByText(/owner: michael brown/i)).toBeTruthy()
  })

  it('renders "Unassigned" for a Ticket with no Owner', async () => {
    mockApi(testStaffUser, () => ({
      data: [ticket({ ownerName: null })],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
      hasAnyTickets: true,
    }))
    renderQueue()

    const table = await screen.findByTestId('queue-table')
    expect(within(table).getByText(/unassigned/i)).toBeTruthy()
  })

  it('shows the default "Sorted oldest first" indicator on first load', async () => {
    mockApi(testStaffUser, () => ({
      data: [ticket()],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
      hasAnyTickets: true,
    }))
    renderQueue()

    expect(await screen.findByText(/sorted oldest first/i)).toBeTruthy()
  })
})

describe('Ticket Queue interactions', () => {
  it('AC-22: typing a search term narrows the list and calls the API with search', async () => {
    const fetchMock = mockApi(testStaffUser, (url) => {
      const search = url.searchParams.get('search')
      if (search === 'vpn') {
        return {
          data: [
            ticket({ id: 3, ticketNumber: 'TKT-2026-000003', summary: 'VPN connection drops' }),
          ],
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
          hasAnyTickets: true,
        }
      }
      return {
        data: [ticket({ id: 1, summary: 'Laptop battery drains quickly' })],
        page: 1,
        pageSize: 10,
        totalCount: 1,
        totalPages: 1,
        hasAnyTickets: true,
      }
    })
    renderQueue()

    await screen.findByTestId('queue-table')
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/search by ticket number or summary/i), 'vpn')

    await waitFor(() =>
      expect(
        within(screen.getByTestId('queue-table')).getByText('VPN connection drops'),
      ).toBeTruthy(),
    )
    const calls = fetchMock.mock.calls.map((c) => c[0] as string)
    expect(
      calls.some((u) => new URL(u, 'http://localhost').searchParams.get('search') === 'vpn'),
    ).toBe(true)
  })

  it('AC-23: choosing a filter opens the panel, shows a removable chip, and calls the API with it', async () => {
    const fetchMock = mockApi(testStaffUser, (url) => {
      const status = url.searchParams.get('status')
      return {
        data: [ticket({ currentStatus: status === 'OPEN' ? 'OPEN' : 'IN_PROGRESS' })],
        page: 1,
        pageSize: 10,
        totalCount: 1,
        totalPages: 1,
        hasAnyTickets: true,
      }
    })
    renderQueue()

    await screen.findByTestId('queue-table')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^filters$/i }))
    await user.selectOptions(screen.getByLabelText(/current status/i), 'OPEN')

    expect(await screen.findByText(/status: open/i)).toBeTruthy()
    const calls = fetchMock.mock.calls.map((c) => c[0] as string)
    expect(
      calls.some((u) => new URL(u, 'http://localhost').searchParams.get('status') === 'OPEN'),
    ).toBe(true)

    // Removing the chip clears the filter.
    await user.click(screen.getByRole('button', { name: /remove filter: status: open/i }))
    await waitFor(() => expect(screen.queryByText(/status: open/i)).toBeNull())
  })

  it('BR-32: clicking a sortable column header toggles sortBy/sortDir', async () => {
    const fetchMock = mockApi(testStaffUser, () => ({
      data: [ticket()],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
      hasAnyTickets: true,
    }))
    renderQueue()

    await screen.findByTestId('queue-table')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /ticket no\./i }))

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => c[0] as string)
      expect(
        calls.some(
          (u) => new URL(u, 'http://localhost').searchParams.get('sortBy') === 'ticketNumber',
        ),
      ).toBe(true)
    })
  })

  it('AC-24: pagination shows "Showing X to Y of Z" and Next loads page 2', async () => {
    const fetchMock = mockApi(testStaffUser, (url) => {
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
    renderQueue()

    expect(await screen.findByText(/showing 1 to 10 of 11 tickets/i)).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(await screen.findByText(/showing 11 to 11 of 11 tickets/i)).toBeTruthy()
    expect(within(screen.getByTestId('queue-table')).getByText('Second page ticket')).toBeTruthy()
    const calls = fetchMock.mock.calls.map((c) => c[0] as string)
    expect(calls.some((u) => new URL(u, 'http://localhost').searchParams.get('page') === '2')).toBe(
      true,
    )
  })
})
