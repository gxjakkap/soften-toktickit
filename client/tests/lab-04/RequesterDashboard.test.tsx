// UI-07, UI-08, UI-09, UI-10 — AC-02, AC-30, AC-31, AC-34, AC-36
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testAdminUser, testStaffUser, testUser } from '../helpers/auth'
import type { AuthUser, RequesterDashboard } from '../../src/types'

// Lab 4 ui-spec.md §3, §2.4 (FR-12, FR-15, BR-37, BR-39..BR-44): the
// Requester Dashboard renders what GET /api/dashboard/requester returns,
// links each value to the drill-down the server gave, and covers every
// screen state.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function dashboard(overrides: Partial<RequesterDashboard> = {}): RequesterDashboard {
  return {
    generatedAt: '2026-10-06T07:05:00.000Z',
    hasAnyTickets: true,
    metrics: {
      openTickets: { value: 6, drillDown: '/tickets?statusGroup=active' },
      waitingForYou: { value: 1, drillDown: '/tickets?status=WAITING_FOR_REQUESTER' },
      resolvedLast30Days: {
        value: 2,
        windowStart: '2026-09-07',
        drillDown: '/tickets?resolvedFrom=2026-09-07',
      },
    },
    recentlyUpdated: [
      {
        id: 101,
        ticketNumber: 'TKT-2026-000101',
        summary: 'Laptop battery drains quickly',
        currentStatus: 'WAITING_FOR_REQUESTER',
        updatedAt: '2026-10-06T04:02:40.000Z',
      },
      {
        id: 102,
        ticketNumber: 'TKT-2026-000102',
        summary: 'Printer jams on the second floor',
        currentStatus: 'IN_PROGRESS',
        updatedAt: '2026-10-05T02:00:00.000Z',
      },
    ],
    recentlyResolved: [
      {
        id: 97,
        ticketNumber: 'TKT-2026-000097',
        summary: 'VPN disconnects every hour',
        currentStatus: 'CLOSED',
        resolvedAt: '2026-10-05T09:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

const ZERO: RequesterDashboard['metrics'] = {
  openTickets: { value: 0, drillDown: '/tickets?statusGroup=active' },
  waitingForYou: { value: 0, drillDown: '/tickets?status=WAITING_FOR_REQUESTER' },
  resolvedLast30Days: {
    value: 0,
    windowStart: '2026-09-07',
    drillDown: '/tickets?resolvedFrom=2026-09-07',
  },
}

const EMPTY_TICKETS = { data: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }

// Each call to /api/dashboard/requester takes the next reply; the last repeats.
type Reply = { status: number; body: unknown } | 'pending'
function mockApi(user: AuthUser, replies: Reply[]) {
  let call = 0
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return jsonResponse(user)
    if (url === '/api/dashboard/requester') {
      const reply = replies[Math.min(call++, replies.length - 1)]!
      if (reply === 'pending') return new Promise<Response>(() => {})
      return jsonResponse(reply.body, reply.status)
    }
    if (url === '/api/dashboard/staff') return new Promise<Response>(() => {})
    if (url === '/api/categories' || url === '/api/related-systems') return jsonResponse([])
    if (url.startsWith('/api/tickets?') || url === '/api/tickets')
      return jsonResponse({ ...EMPTY_TICKETS, hasAnyTickets: true })
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ok = (body: RequesterDashboard) => ({ status: 200, body })
const serverError = {
  status: 500,
  body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const card = (name: string) => screen.getByRole('link', { name })
const requested = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([url]) => String(url))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-07 cards and lists (FR-12, AC-02)', () => {
  it('renders the three cards in ui-spec.md §3 order with the server values', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')

    const metrics = await screen.findByRole('region', { name: 'Metrics' })
    expect(
      within(metrics)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual([
      'Open Tickets: 6. View tickets',
      'Waiting for You: 1. View tickets',
      'Resolved (Last 30 Days): 2. View tickets',
    ])
  })

  it('welcomes the signed-in Requester by name under the Dashboard title', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText(`Welcome back, ${testUser.name}. Your tickets at a glance.`))
    expect(screen.getByText(/times shown in bangkok time/i)).toBeTruthy()
  })

  it('marks Waiting for You with a border and an icon while it is above 0', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')

    const waiting = await screen.findByRole('link', { name: 'Waiting for You: 1. View tickets' })
    expect(waiting.className).toContain('is-attention')
    expect(waiting.querySelector('.bi')).toBeTruthy()
    expect(card('Open Tickets: 6. View tickets').className).not.toContain('is-attention')
  })

  it('lists recently updated and recently resolved Tickets, each linking to Ticket Detail', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')

    const updated = await screen.findByRole('region', { name: 'Recently Updated' })
    const rows = within(updated).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const first = within(rows[0]!)
    expect(first.getByRole('link', { name: 'TKT-2026-000101' }).getAttribute('href')).toBe(
      '/tickets/101',
    )
    expect(first.getByText('Laptop battery drains quickly')).toBeTruthy()
    // Status is text in the badge, not color only.
    expect(first.getByText('Waiting for Requester')).toBeTruthy()
    // ui-spec.md §2.1: Bangkok time (UTC+7) with the exact instant in dateTime.
    const time = rows[0]!.querySelector('time')!
    expect(time.getAttribute('dateTime')).toBe('2026-10-06T04:02:40.000Z')
    expect(time.textContent).toBe('6 Oct 2026, 11:02')

    const resolved = screen.getByRole('region', { name: 'Recently Resolved' })
    expect(
      within(resolved).getByRole('link', { name: 'TKT-2026-000097' }).getAttribute('href'),
    ).toBe('/tickets/97')
    expect(within(resolved).getByText('Closed')).toBeTruthy()
    expect(within(resolved).getByText('5 Oct 2026, 16:00')).toBeTruthy()
  })

  it('duplicates no My Tickets features: no search, filters, or pagination', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')
    await screen.findByRole('region', { name: 'Metrics' })

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull()
  })

  it('reads only its own endpoint, never a staff one', async () => {
    const fetchMock = mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')
    await screen.findByRole('region', { name: 'Metrics' })

    expect(requested(fetchMock)).toContain('/api/dashboard/requester')
    expect(requested(fetchMock).filter((url) => url.startsWith('/api/staff'))).toEqual([])
    expect(requested(fetchMock)).not.toContain('/api/dashboard/staff')
  })
})

describe('UI-09 drill-down links (AC-30)', () => {
  it('links each card to the drill-down the server returned', async () => {
    const data = dashboard()
    mockApi(testUser, [ok(data)])
    renderAt('/dashboard')
    await screen.findByRole('region', { name: 'Metrics' })

    expect(card('Open Tickets: 6. View tickets').getAttribute('href')).toBe(
      data.metrics.openTickets.drillDown,
    )
    expect(card('Waiting for You: 1. View tickets').getAttribute('href')).toBe(
      data.metrics.waitingForYou.drillDown,
    )
    expect(card('Resolved (Last 30 Days): 2. View tickets').getAttribute('href')).toBe(
      data.metrics.resolvedLast30Days.drillDown,
    )
  })

  it('opens My Tickets with the Waiting for Requester filter visible in its controls', async () => {
    const fetchMock = mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')

    await userEvent.click(await screen.findByRole('link', { name: /^Waiting for You: 1/ }))

    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeTruthy()
    expect((screen.getByLabelText('Current Status') as HTMLSelectElement).value).toBe(
      'WAITING_FOR_REQUESTER',
    )
    await waitFor(() =>
      expect(requested(fetchMock)).toContainEqual(
        expect.stringContaining('/api/tickets?status=WAITING_FOR_REQUESTER'),
      ),
    )
  })

  it('opens My Tickets with an "Active only" chip from Open Tickets', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')

    await userEvent.click(await screen.findByRole('link', { name: /^Open Tickets: 6/ }))

    expect(await screen.findByRole('button', { name: 'Remove filter: Active only' })).toBeTruthy()
  })

  it('sends "View all my tickets" to My Tickets sorted by last update', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')

    const updated = await screen.findByRole('region', { name: 'Recently Updated' })
    expect(
      within(updated)
        .getByRole('link', { name: /view all my tickets/i })
        .getAttribute('href'),
    ).toBe('/tickets?sortBy=updatedAt&sortDir=desc')
  })
})

describe('UI-08 zero and empty states (AC-31, BR-37, BR-40)', () => {
  it('shows 0 with each helper and keeps every link active', async () => {
    mockApi(testUser, [ok(dashboard({ metrics: ZERO }))])
    renderAt('/dashboard')

    const open = await screen.findByRole('link', { name: 'Open Tickets: 0. View tickets' })
    expect(open.getAttribute('href')).toBe('/tickets?statusGroup=active')
    expect(within(open).getByText('0')).toBeTruthy()
    expect(within(open).getByText('No open tickets.')).toBeTruthy()

    const waiting = card('Waiting for You: 0. View tickets')
    expect(within(waiting).getByText('Nothing needs your reply.')).toBeTruthy()
    expect(waiting.className).not.toContain('is-attention')

    const resolved = card('Resolved (Last 30 Days): 0. View tickets')
    expect(resolved.getAttribute('href')).toBe('/tickets?resolvedFrom=2026-09-07')
    expect(within(resolved).getByText('No tickets resolved in the last 30 days.')).toBeTruthy()
  })

  it('shows each list empty message', async () => {
    mockApi(testUser, [ok(dashboard({ recentlyUpdated: [], recentlyResolved: [] }))])
    renderAt('/dashboard')

    const updated = await screen.findByRole('region', { name: 'Recently Updated' })
    expect(within(updated).getByText('No recent updates.')).toBeTruthy()
    const resolved = screen.getByRole('region', { name: 'Recently Resolved' })
    expect(within(resolved).getByText('No resolved tickets yet.')).toBeTruthy()
  })

  it('replaces cards and lists with one Create Ticket prompt when there are no Tickets', async () => {
    mockApi(testUser, [
      ok(
        dashboard({
          hasAnyTickets: false,
          metrics: ZERO,
          recentlyUpdated: [],
          recentlyResolved: [],
        }),
      ),
    ])
    renderAt('/dashboard')

    const empty = await screen.findByRole('region', {
      name: "You haven't submitted any tickets yet.",
    })
    expect(within(empty).getByRole('link', { name: 'Create Ticket' }).getAttribute('href')).toBe(
      '/tickets/new',
    )
    expect(screen.queryByRole('region', { name: 'Metrics' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Recently Updated' })).toBeNull()
    // One Create Ticket action in the page body, not a second one in the header.
    expect(
      within(screen.getByRole('main')).getAllByRole('link', { name: 'Create Ticket' }),
    ).toHaveLength(1)
  })
})

describe('UI-10 loading, failure, and forbidden (AC-34)', () => {
  it('shows skeleton cards while loading', async () => {
    mockApi(testUser, ['pending'])
    renderAt('/dashboard')

    const loading = await screen.findByTestId('dashboard-loading')
    expect(loading.getAttribute('aria-busy')).toBe('true')
    expect(loading.querySelectorAll('.zg-metric-skeleton')).toHaveLength(3)
    expect(screen.queryByRole('region', { name: 'Metrics' })).toBeNull()
  })

  it('shows the safe banner with no numbers, and Retry recovers', async () => {
    mockApi(testUser, [serverError, ok(dashboard())])
    renderAt('/dashboard')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("We couldn't load your dashboard.")
    expect(screen.queryByRole('region', { name: 'Metrics' })).toBeNull()

    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('region', { name: 'Metrics' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the last good numbers when a refresh fails', async () => {
    mockApi(testUser, [ok(dashboard()), serverError])
    renderAt('/dashboard')
    await screen.findByRole('region', { name: 'Metrics' })

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Showing the last loaded numbers.',
    )
    expect(card('Open Tickets: 6. View tickets')).toBeTruthy()
  })

  it('shows the full-page forbidden state if the API answers 403', async () => {
    mockApi(testUser, [
      { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } },
    ])
    renderAt('/dashboard')

    expect(await screen.findByTestId('dashboard-forbidden')).toBeTruthy()
  })

  it.each([
    ['IT Staff', testStaffUser],
    ['an Administrator', testAdminUser],
  ])('never renders the Requester view or calls its endpoint for %s', async (_, user) => {
    const fetchMock = mockApi(user, [ok(dashboard())])
    renderAt('/dashboard')

    expect(await screen.findByText(/operational overview/i)).toBeTruthy()
    expect(screen.queryByText(/your tickets at a glance/i)).toBeNull()
    expect(requested(fetchMock)).not.toContain('/api/dashboard/requester')
  })
})

describe('Quick actions and navigation (AC-36)', () => {
  it('offers a Create Ticket link that opens the Create Ticket screen', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/dashboard')
    await screen.findByRole('region', { name: 'Metrics' })

    const main = screen.getByRole('main')
    await userEvent.click(within(main).getByRole('link', { name: 'Create Ticket' }))
    expect(await screen.findByRole('heading', { name: /create.*ticket/i, level: 1 })).toBeTruthy()
  })

  it.each([
    ['/dashboard', 'Dashboard'],
    ['/tickets', 'My Tickets'],
    ['/tickets/new', 'Create Ticket'],
  ])('marks only the current item on %s', async (path, active) => {
    mockApi(testUser, [ok(dashboard())])
    renderAt(path)

    const nav = await screen.findByRole('navigation', { name: /main/i })
    await waitFor(() =>
      expect(
        within(nav)
          .getAllByRole('link')
          .map((link) => [link.textContent, link.getAttribute('aria-current')]),
      ).toEqual(
        ['Dashboard', 'My Tickets', 'Create Ticket'].map((item) => [
          item,
          item === active ? 'page' : null,
        ]),
      ),
    )
    expect(within(nav).getByRole('link', { name: active }).className).toContain('is-active')
  })

  it('keeps My Tickets active on a Ticket Detail page', async () => {
    mockApi(testUser, [ok(dashboard())])
    renderAt('/tickets/101')

    const nav = await screen.findByRole('navigation', { name: /main/i })
    expect(within(nav).getByRole('link', { name: 'My Tickets' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe(
      null,
    )
  })
})
