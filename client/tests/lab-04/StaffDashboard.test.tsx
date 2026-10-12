// UI-01, UI-02, UI-03, UI-04, UI-05, UI-06 — AC-28, AC-30, AC-31, AC-33, AC-34, AC-36, AC-37
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testAdminUser, testStaffUser, testUser } from '../helpers/auth'
import type { AuthUser, StaffDashboard } from '../../src/types'

// Lab 4 ui-spec.md §4, §2.4 (FR-13..FR-15, BR-37, BR-45..BR-55): the IT
// Staff Dashboard renders what GET /api/dashboard/staff returns, links each
// value to the drill-down the server gave, and covers every screen state.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function dashboard(overrides: Partial<StaffDashboard> = {}): StaffDashboard {
  return {
    generatedAt: '2026-10-06T07:05:00.000Z',
    today: '2026-10-06',
    metrics: {
      myOpenActions: {
        value: 4,
        ticketCount: 3,
        drillDown: '/staff/tickets?openActionAssigneeId=12&statusGroup=active',
      },
      unassigned: { value: 5, drillDown: '/staff/tickets?ownerId=unassigned&statusGroup=active' },
      myActiveTickets: { value: 7, drillDown: '/staff/tickets?ownerId=12&statusGroup=active' },
      followUpsPending: {
        value: 2,
        drillDown: '/staff/tickets?followUp=pending&statusGroup=active',
      },
      highPriority: { value: 1, drillDown: '/staff/tickets?itPriority=HIGH&statusGroup=active' },
      resolvedToday: {
        value: 6,
        drillDown: '/staff/tickets?resolvedFrom=2026-10-06&resolvedTo=2026-10-06',
      },
    },
    byStatus: [
      'NEW',
      'OPEN',
      'IN_PROGRESS',
      'WAITING_FOR_REQUESTER',
      'RESOLVED',
      'CLOSED',
      'REOPENED',
      'CANCELLED',
    ].map((status, i) => ({
      status: status as StaffDashboard['byStatus'][number]['status'],
      value: i,
      drillDown: `/staff/tickets?status=${status}`,
    })),
    activeByItPriority: (['LOW', 'MEDIUM', 'HIGH'] as const).map((itPriority, i) => ({
      itPriority,
      value: 10 + i,
      drillDown: `/staff/tickets?itPriority=${itPriority}&statusGroup=active`,
    })),
    myOpenActionList: [
      {
        actionId: 5003,
        ticketId: 101,
        ticketNumber: 'TKT-2026-000101',
        description: 'Order replacement battery from vendor',
        status: 'PLANNED',
        actionAt: '2026-10-07T02:00:00.000Z',
        drillDown: '/staff/tickets/101#actions-taken',
      },
    ],
    recentlyUpdated: [
      {
        id: 102,
        ticketNumber: 'TKT-2026-000102',
        summary: 'VPN disconnects every hour',
        currentStatus: 'WAITING_FOR_REQUESTER',
        ownerName: null,
        updatedAt: '2026-10-06T04:02:40.000Z',
      },
    ],
    ...overrides,
  }
}

const USER_ACCOUNTS: StaffDashboard['userAccounts'] = {
  REQUESTER: { active: 5, inactive: 1, drillDown: '/admin/users?role=REQUESTER' },
  IT_STAFF: { active: 3, inactive: 1, drillDown: '/admin/users?role=IT_STAFF' },
  ADMINISTRATOR: { active: 1, inactive: 0, drillDown: '/admin/users?role=ADMINISTRATOR' },
}

const EMPTY_TICKETS = { data: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }

// Each call to /api/dashboard/staff takes the next reply; the last repeats.
type Reply = { status: number; body: unknown } | 'pending'
function mockApi(user: AuthUser, replies: Reply[]) {
  let call = 0
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return jsonResponse(user)
    if (url === '/api/dashboard/staff') {
      const reply = replies[Math.min(call++, replies.length - 1)]
      if (reply === 'pending') return new Promise<Response>(() => {})
      return jsonResponse(reply.body, reply.status)
    }
    if (url.startsWith('/api/tickets'))
      return jsonResponse({ ...EMPTY_TICKETS, hasAnyTickets: false })
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ok = (body: StaffDashboard) => ({ status: 200, body })
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

const metrics = () => screen.getByRole('region', { name: 'Metrics' })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-01 metric cards', () => {
  it('renders the six cards in ui-spec order with their values and "across N tickets"', async () => {
    mockApi(testStaffUser, [ok(dashboard())])
    renderAt('/dashboard')
    await screen.findByRole('link', { name: 'My Open Actions: 4. View tickets' })

    const names = within(metrics())
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'))
    expect(names).toEqual([
      'My Open Actions: 4. View tickets',
      'My Active Tickets: 7. View tickets',
      'Follow-Ups Pending: 2. View tickets',
      'Unassigned: 5. View tickets',
      'High Priority: 1. View tickets',
      'Resolved Today: 6. View tickets',
    ])
    expect(within(metrics()).getByText('across 3 tickets')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText(/welcome back, sarah johnson/i)).toBeTruthy()
  })

  it('AC-37: shows "Updated" and list times in Bangkok time', async () => {
    mockApi(testStaffUser, [ok(dashboard())])
    renderAt('/dashboard')

    const updated = await screen.findByText('14:05')
    expect(updated.tagName).toBe('TIME')
    expect(updated.getAttribute('datetime')).toBe('2026-10-06T07:05:00.000Z')
    expect(screen.getByText('7 Oct 2026, 09:00')).toBeTruthy()
    expect(screen.getByText(/times shown in bangkok time/i)).toBeTruthy()
  })
})

describe('UI-02 drill-down links', () => {
  it('points every card, breakdown row, list row, and "View all" at the documented target', async () => {
    const data = dashboard()
    mockApi(testStaffUser, [ok(data)])
    renderAt('/dashboard')
    await screen.findByRole('link', { name: /^my open actions: 4/i })

    const href = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('href')
    expect(href('My Open Actions: 4. View tickets')).toBe(data.metrics.myOpenActions.drillDown)
    expect(href('My Active Tickets: 7. View tickets')).toBe(data.metrics.myActiveTickets.drillDown)
    expect(href('Follow-Ups Pending: 2. View tickets')).toBe(
      data.metrics.followUpsPending.drillDown,
    )
    expect(href('Unassigned: 5. View tickets')).toBe(data.metrics.unassigned.drillDown)
    expect(href('High Priority: 1. View tickets')).toBe(data.metrics.highPriority.drillDown)
    expect(href('Resolved Today: 6. View tickets')).toBe(data.metrics.resolvedToday.drillDown)

    // BR-51/BR-52 breakdowns: all eight statuses and three priorities.
    const byStatus = screen.getByRole('region', { name: 'Tickets by Status' })
    expect(within(byStatus).getAllByRole('link')).toHaveLength(8)
    expect(href('Waiting for Requester: 3. View tickets')).toBe(
      '/staff/tickets?status=WAITING_FOR_REQUESTER',
    )
    const byPriority = screen.getByRole('region', { name: 'Active Tickets by IT Priority' })
    expect(within(byPriority).getAllByRole('link')).toHaveLength(3)
    expect(href('High IT Priority: 12. View tickets')).toBe(
      '/staff/tickets?itPriority=HIGH&statusGroup=active',
    )

    // BR-53: an open Action opens its Ticket at the Actions Taken section.
    const actions = screen.getByRole('region', { name: 'My Open Actions' })
    expect(
      within(actions).getByRole('link', { name: 'TKT-2026-000101' }).getAttribute('href'),
    ).toBe('/staff/tickets/101#actions-taken')
    expect(within(actions).getByText('Order replacement battery from vendor')).toBeTruthy()
    expect(within(actions).getByText('Planned')).toBeTruthy()
    expect(
      within(actions)
        .getByRole('link', { name: /view all/i })
        .getAttribute('href'),
    ).toBe(data.metrics.myOpenActions.drillDown)

    // BR-54: Ticket rows open Ticket Detail; the status badge carries text.
    const recent = screen.getByRole('region', { name: 'Recently Updated' })
    expect(within(recent).getByRole('link', { name: 'TKT-2026-000102' }).getAttribute('href')).toBe(
      '/staff/tickets/102',
    )
    expect(within(recent).getByText('Waiting for Requester')).toBeTruthy()
    expect(within(recent).getByText('Unassigned')).toBeTruthy()
    expect(
      within(recent)
        .getByRole('link', { name: /view all in ticket queue/i })
        .getAttribute('href'),
    ).toBe('/staff/tickets?sortBy=updatedAt&sortDir=desc')
  })
})

describe('UI-03 zero values and empty lists', () => {
  it('shows 0 with the empty helper, keeps the link, and shows each list message', async () => {
    const data = dashboard({ myOpenActionList: [], recentlyUpdated: [] })
    data.metrics.unassigned.value = 0
    data.metrics.myOpenActions = { ...data.metrics.myOpenActions, value: 0, ticketCount: 0 }
    mockApi(testStaffUser, [ok(data)])
    renderAt('/dashboard')

    const card = await screen.findByRole('link', { name: 'Unassigned: 0. View tickets' })
    expect(card.getAttribute('href')).toBe(data.metrics.unassigned.drillDown)
    expect(within(card).getByText('0')).toBeTruthy()
    expect(within(card).getByText('Every active ticket has an owner.')).toBeTruthy()
    expect(
      within(screen.getByRole('link', { name: 'My Open Actions: 0. View tickets' })).getByText(
        'No open actions assigned to you.',
      ),
    ).toBeTruthy()

    const actions = screen.getByRole('region', { name: 'My Open Actions' })
    expect(within(actions).getByText('No open actions assigned to you.')).toBeTruthy()
    const recent = screen.getByRole('region', { name: 'Recently Updated' })
    expect(within(recent).getByText('No tickets yet.')).toBeTruthy()
  })
})

describe('UI-04 loading, failure, and forbidden', () => {
  it('shows skeletons while the first load is pending, with no numbers', async () => {
    mockApi(testStaffUser, ['pending'])
    renderAt('/dashboard')

    expect(await screen.findByTestId('dashboard-loading')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Metrics' })).toBeNull()
    expect(screen.getByRole('button', { name: /refreshing/i })).toHaveProperty('disabled', true)
  })

  it('shows the safe error with Retry, and Retry recovers', async () => {
    mockApi(testStaffUser, [serverError, ok(dashboard())])
    renderAt('/dashboard')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/we couldn't load your dashboard/i)
    expect(screen.queryByRole('region', { name: 'Metrics' })).toBeNull()

    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: /^unassigned: 5/i })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the full-page forbidden state on a 403', async () => {
    mockApi(testStaffUser, [
      { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Forbidden.' } } },
    ])
    renderAt('/dashboard')

    expect(await screen.findByTestId('dashboard-forbidden')).toBeTruthy()
  })
})

describe('UI-05 Administrator variant', () => {
  it('shows User Accounts with a link per role for an Administrator', async () => {
    mockApi(testAdminUser, [ok(dashboard({ userAccounts: USER_ACCOUNTS }))])
    renderAt('/dashboard')

    const section = await screen.findByRole('region', { name: 'User Accounts' })
    expect(within(section).getAllByRole('row')).toHaveLength(4)
    const link = within(section).getByRole('link', {
      name: 'IT Staff: 3 active, 1 inactive. View users',
    })
    expect(link.getAttribute('href')).toBe('/admin/users?role=IT_STAFF')
    expect(
      within(section)
        .getByRole('link', { name: /^requester: 5 active/i })
        .getAttribute('href'),
    ).toBe('/admin/users?role=REQUESTER')
  })

  it('has no User Accounts section for IT Staff', async () => {
    mockApi(testStaffUser, [ok(dashboard())])
    renderAt('/dashboard')
    await screen.findByRole('region', { name: 'Metrics' })

    expect(screen.queryByRole('region', { name: 'User Accounts' })).toBeNull()
  })
})

describe('UI-06 refresh', () => {
  it('refetches and updates the "Updated" time without a page reload', async () => {
    const fetchMock = mockApi(testStaffUser, [
      ok(dashboard()),
      ok(dashboard({ generatedAt: '2026-10-06T08:30:00.000Z' })),
    ])
    renderAt('/dashboard')
    await screen.findByText('14:05')

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('15:30')).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/dashboard/staff')).toHaveLength(2)
  })

  it('keeps the last good numbers visible with an error notice when a refresh fails', async () => {
    mockApi(testStaffUser, [ok(dashboard()), serverError])
    renderAt('/dashboard')
    await screen.findByRole('link', { name: /^unassigned: 5/i })

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/couldn't refresh/i)
    expect(screen.getByRole('link', { name: /^unassigned: 5/i })).toBeTruthy()
    expect(screen.getByText('14:05')).toBeTruthy()
  })
})

describe('Navigation and access (AC-36)', () => {
  it('marks Dashboard as the current page in the IT Staff nav', async () => {
    mockApi(testStaffUser, [ok(dashboard())])
    renderAt('/dashboard')
    await screen.findByRole('region', { name: 'Metrics' })

    const nav = screen.getByRole('navigation', { name: /main/i })
    const link = within(nav).getByRole('link', { name: 'Dashboard' })
    expect(link.getAttribute('aria-current')).toBe('page')
    expect(
      within(nav).getByRole('link', { name: 'Ticket Queue' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  // Changes when the Requester Dashboard (#68) adds its own nav item.
  it('gives a Requester no Dashboard nav item and sends /dashboard to My Tickets', async () => {
    mockApi(testUser, [])
    renderAt('/dashboard')

    expect(await screen.findByRole('heading', { name: /my tickets/i })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: /main/i })
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).toBeNull()
    await waitFor(() => expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/api/dashboard/staff'))
  })
})
