// UI-32, UI-33, UI-34, UI-35, UI-36, UI-37 — AC-02, AC-36, AC-47
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testAdminUser, testStaffUser, testUser } from '../helpers/auth'
import type { AuthUser } from '../../src/types'

// Lab 4 ui-spec.md §1, §2.5, §7 (FR-16, FR-17): Dashboard navigation and
// landing for every role, and the URL-driven filters that make My Tickets,
// the Ticket Queue, and User Management work as drill-down targets.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

const QUEUE_ROW = {
  id: 1,
  ticketNumber: 'TKT-2026-000101',
  summary: 'Laptop battery drains quickly',
  categoryName: 'Hardware',
  requestedPriority: 'MEDIUM',
  itPriority: 'HIGH',
  currentStatus: 'IN_PROGRESS',
  ownerName: null,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}

const queueBody = (totalCount: number) => ({
  data: totalCount ? [QUEUE_ROW] : [],
  page: 1,
  pageSize: 10,
  totalCount,
  totalPages: totalCount ? 1 : 0,
  hasAnyTickets: true,
})

const DASHBOARD_PENDING = new Promise<Response>(() => {})

function mockApi(
  user: AuthUser | null,
  options: {
    onQueue?: (url: URL) => Promise<Response>
    onTickets?: (url: URL) => Promise<Response>
    loginAs?: AuthUser
  } = {},
) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') {
      return user
        ? jsonResponse(user)
        : jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'No session.' } }, 401)
    }
    if (url === '/api/auth/login' && init?.method === 'POST') return jsonResponse(options.loginAs)
    if (url === '/api/dashboard/staff') return DASHBOARD_PENDING
    if (url === '/api/dashboard/requester') return DASHBOARD_PENDING
    if (url === '/api/tickets' || url.startsWith('/api/tickets?')) {
      const parsed = new URL(url, 'http://localhost')
      return options.onTickets ? options.onTickets(parsed) : jsonResponse(queueBody(1))
    }
    if (url === '/api/categories') return jsonResponse([{ id: 1, name: 'Hardware' }])
    if (url === '/api/staff/it-staff-users') {
      return jsonResponse([{ id: 14, name: 'Ahmed Hassan', role: 'IT_STAFF' }])
    }
    if (url.startsWith('/api/staff/tickets')) {
      const parsed = new URL(url, 'http://localhost')
      return options.onQueue ? options.onQueue(parsed) : jsonResponse(queueBody(1))
    }
    if (url.startsWith('/api/admin/users')) return jsonResponse({ data: [], totalCount: 0 })
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function Location() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <Location />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const location = () => screen.getByTestId('location').textContent
const queueUrls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith('/api/staff/tickets'))
    .map((url) => new URL(url, 'http://localhost'))
const lastQueueUrl = (fetchMock: ReturnType<typeof mockApi>) => queueUrls(fetchMock).slice(-1)[0]!
const lastTicketsUrl = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url === '/api/tickets' || url.startsWith('/api/tickets?'))
    .map((url) => new URL(url, 'http://localhost'))
    .slice(-1)[0]!

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-32 navigation per role', () => {
  it.each([
    ['IT Staff', testStaffUser, ['Dashboard', 'Ticket Queue']],
    ['an Administrator', testAdminUser, ['Dashboard', 'Ticket Queue', 'User Management']],
  ])('lists the permitted items for %s with Dashboard first', async (_, user, items) => {
    mockApi(user)
    renderAt('/staff/tickets')
    await screen.findByRole('heading', { name: 'Ticket Queue' })

    const nav = screen.getByRole('navigation', { name: /main/i })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(items)
    // Dashboard is active only on /dashboard; the Queue is active here.
    expect(
      within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current'),
    ).toBeNull()
    expect(
      within(nav).getByRole('link', { name: 'Ticket Queue' }).getAttribute('aria-current'),
    ).toBe('page')
  })
})

describe('UI-33 landing', () => {
  it.each([
    ['IT Staff', testStaffUser],
    ['an Administrator', testAdminUser],
  ])('sends %s from / to /dashboard', async (_, user) => {
    mockApi(user)
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(location()).toBe('/dashboard')
  })

  it('lands IT Staff on /dashboard after signing in', async () => {
    mockApi(null, { loginAs: testStaffUser })
    renderAt('/login')

    await userEvent.type(await screen.findByLabelText(/email address/i), testStaffUser.email)
    await userEvent.type(screen.getByLabelText(/^password/i), 'Secret#2026')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(location()).toBe('/dashboard'))
  })

  it('still sends a user who must change their password to Change Password', async () => {
    mockApi(null, { loginAs: { ...testStaffUser, mustChangePassword: true } })
    renderAt('/login')

    await userEvent.type(await screen.findByLabelText(/email address/i), testStaffUser.email)
    await userEvent.type(screen.getByLabelText(/^password/i), 'Secret#2026')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(location()).toBe('/change-password'))
  })

  it('keeps a deep link to a Queue URL instead of redirecting to the dashboard', async () => {
    mockApi(testStaffUser)
    renderAt('/staff/tickets?status=NEW')

    await screen.findByRole('heading', { name: 'Ticket Queue' })
    expect(location()).toBe('/staff/tickets?status=NEW')
  })
})

describe('UI-34 Ticket Queue URL filters', () => {
  it('requests the drill-down params from the URL and shows each as a chip', async () => {
    const fetchMock = mockApi(testStaffUser)
    renderAt(
      '/staff/tickets?openActionAssigneeId=12&statusGroup=active&followUp=pending&resolvedFrom=2026-10-06&resolvedTo=2026-10-06',
    )
    await screen.findByText('TKT-2026-000101', { selector: 'a' })

    const params = lastQueueUrl(fetchMock).searchParams
    expect(params.get('openActionAssigneeId')).toBe('12')
    expect(params.get('statusGroup')).toBe('active')
    expect(params.get('followUp')).toBe('pending')
    expect(params.get('resolvedFrom')).toBe('2026-10-06')
    expect(params.get('resolvedTo')).toBe('2026-10-06')

    for (const chip of [
      'Open actions: me',
      'Active only',
      'Follow-up pending',
      'Resolved 6 Oct 2026',
    ]) {
      expect(screen.getByRole('button', { name: `Remove filter: ${chip}` })).toBeTruthy()
    }
  })

  it('names the owner and open-action assignee chips for another user', async () => {
    mockApi(testStaffUser)
    renderAt('/staff/tickets?ownerId=14&openActionAssigneeId=14')

    expect(
      await screen.findByRole('button', { name: 'Remove filter: Owner: Ahmed Hassan' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Remove filter: Open actions: Ahmed Hassan' }),
    ).toBeTruthy()
  })

  it('shows the Lab 3 filters from the URL in the Filters panel, with "me" as the owner', async () => {
    mockApi(testStaffUser)
    renderAt('/staff/tickets?ownerId=12&itPriority=HIGH&statusGroup=active')
    await screen.findByText('TKT-2026-000101', { selector: 'a' })

    expect(screen.getByRole('button', { name: 'Remove filter: Owner: Me' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove filter: IT Priority: High' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect((screen.getByLabelText('Owner') as HTMLSelectElement).value).toBe('12')
    expect((screen.getByLabelText('IT Priority') as HTMLSelectElement).value).toBe('HIGH')
  })

  it('removing a chip drops the param from the URL and the next request', async () => {
    const fetchMock = mockApi(testStaffUser)
    renderAt('/staff/tickets?followUp=pending&statusGroup=active')
    await screen.findByText('TKT-2026-000101', { selector: 'a' })

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Follow-up pending' }))

    await waitFor(() => expect(location()).toBe('/staff/tickets?statusGroup=active'))
    await waitFor(() => expect(lastQueueUrl(fetchMock).searchParams.has('followUp')).toBe(false))
    expect(lastQueueUrl(fetchMock).searchParams.get('statusGroup')).toBe('active')
  })

  it('writes a Filters panel change and a sort change back to the URL', async () => {
    mockApi(testStaffUser)
    renderAt('/staff/tickets')
    await screen.findByText('TKT-2026-000101', { selector: 'a' })

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.selectOptions(screen.getByLabelText('Current Status'), 'NEW')
    await waitFor(() => expect(location()).toBe('/staff/tickets?status=NEW'))

    await userEvent.click(screen.getByRole('button', { name: 'Status' }))
    await waitFor(() =>
      expect(location()).toBe('/staff/tickets?status=NEW&sortBy=currentStatus&sortDir=asc'),
    )
  })

  it('Clear Filters removes every filter param', async () => {
    mockApi(testStaffUser)
    renderAt('/staff/tickets?statusGroup=active&itPriority=HIGH')
    await screen.findByText('TKT-2026-000101', { selector: 'a' })

    await userEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
    await waitFor(() => expect(location()).toBe('/staff/tickets'))
  })

  it('moves a page past the end to the last page and shows its rows', async () => {
    const fetchMock = mockApi(testStaffUser, {
      onQueue: (url) =>
        url.searchParams.get('page') === '5'
          ? jsonResponse({ ...queueBody(3), data: [], page: 5 })
          : jsonResponse(queueBody(3)),
    })
    renderAt('/staff/tickets?status=OPEN&page=5')

    expect(await screen.findByText('TKT-2026-000101', { selector: 'a' })).toBeTruthy()
    expect(location()).toBe('/staff/tickets?status=OPEN')
    expect(lastQueueUrl(fetchMock).searchParams.get('page')).toBe('1')
  })

  it('clears the search box when the nav link drops the search from the URL', async () => {
    mockApi(testStaffUser)
    renderAt('/staff/tickets?search=laptop&status=OPEN')
    await screen.findByText('TKT-2026-000101', { selector: 'a' })
    const nav = screen.getByRole('navigation', { name: 'Main' })

    await userEvent.click(within(nav).getByRole('link', { name: 'Ticket Queue' }))
    await waitFor(() => expect(location()).toBe('/staff/tickets'))
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('')
    // The search debounce must not write the old value back.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(location()).toBe('/staff/tickets')
  })

  it('shows an unknown filter value as typed in its chip', async () => {
    mockApi(testStaffUser, {
      onQueue: () =>
        jsonResponse(
          { error: { code: 'INVALID_FILTER', message: 'Invalid filter.', field: 'status' } },
          400,
        ),
    })
    renderAt('/staff/tickets?status=BOGUS&itPriority=URGENT&resolvedFrom=someday')
    await screen.findByRole('alert')

    for (const chip of ['Status: BOGUS', 'IT Priority: URGENT', 'Resolved since someday']) {
      expect(screen.getByRole('button', { name: `Remove filter: ${chip}` })).toBeTruthy()
    }
    expect(document.body.textContent).not.toMatch(/undefined/)
  })
})

describe('UI-37 invalid URL filter', () => {
  it('shows the safe banner with Clear filters, which recovers', async () => {
    mockApi(testStaffUser, {
      onQueue: (url) =>
        url.searchParams.get('statusGroup') === 'bogus'
          ? jsonResponse(
              {
                error: {
                  code: 'INVALID_FILTER',
                  message: 'statusGroup must be active.',
                  field: 'statusGroup',
                },
              },
              400,
            )
          : jsonResponse(queueBody(1)),
    })
    renderAt('/staff/tickets?statusGroup=bogus')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/statusGroup must be active/)
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByText('TKT-2026-000101', { selector: 'a' })).toBeTruthy()
    expect(location()).toBe('/staff/tickets')
  })

  it('Clear filters also drops an unknown sort the route refuses', async () => {
    mockApi(testStaffUser, {
      onQueue: (url) =>
        url.searchParams.get('sortDir') === 'sideways'
          ? jsonResponse(
              { error: { code: 'INVALID_FILTER', message: 'Invalid sort.', field: 'sortDir' } },
              400,
            )
          : jsonResponse(queueBody(1)),
    })
    renderAt('/staff/tickets?sortDir=sideways&status=OPEN')

    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByText('TKT-2026-000101', { selector: 'a' })).toBeTruthy()
    expect(location()).toBe('/staff/tickets')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('UI-36 User Management URL role', () => {
  it('applies role from the URL as the request filter and a chip', async () => {
    const fetchMock = mockApi(testAdminUser)
    renderAt('/admin/users?role=IT_STAFF')

    expect(
      await screen.findByRole('button', { name: 'Remove filter: Role: IT Staff' }),
    ).toBeTruthy()
    const listCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith('/api/admin/users'))
    expect(listCalls[listCalls.length - 1]).toContain('role=IT_STAFF')

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Role: IT Staff' }))
    await waitFor(() => expect(location()).toBe('/admin/users'))
  })

  it('clears the search box when the nav link drops the search from the URL', async () => {
    mockApi(testAdminUser)
    renderAt('/admin/users?search=ahmed')
    await waitFor(() =>
      expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('ahmed'),
    )
    const nav = screen.getByRole('navigation', { name: 'Main' })

    await userEvent.click(within(nav).getByRole('link', { name: 'User Management' }))
    await waitFor(() => expect(location()).toBe('/admin/users'))
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(location()).toBe('/admin/users')
  })
})

// Lab 4 ui-spec.md §1, §2.5 (FR-16, FR-17, AC-47): the Requester parts.
describe('UI-32/UI-33 Requester navigation and landing', () => {
  it('lists Dashboard, My Tickets, and Create Ticket, with My Tickets active on /tickets', async () => {
    mockApi(testUser)
    renderAt('/tickets')
    await screen.findByRole('heading', { name: 'My Tickets' })

    const nav = screen.getByRole('navigation', { name: /main/i })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Dashboard', 'My Tickets', 'Create Ticket'])
    expect(within(nav).getByRole('link', { name: 'My Tickets' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  it('sends a Requester from / to /dashboard', async () => {
    mockApi(testUser)
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(location()).toBe('/dashboard')
  })

  it('lands a Requester on /dashboard after signing in', async () => {
    mockApi(null, { loginAs: testUser })
    renderAt('/login')

    await userEvent.type(await screen.findByLabelText(/email address/i), testUser.email)
    await userEvent.type(screen.getByLabelText(/^password/i), 'Secret#2026')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(location()).toBe('/dashboard'))
  })

  it('still sends a Requester who must change their password to Change Password', async () => {
    mockApi(null, { loginAs: { ...testUser, mustChangePassword: true } })
    renderAt('/login')

    await userEvent.type(await screen.findByLabelText(/email address/i), testUser.email)
    await userEvent.type(screen.getByLabelText(/^password/i), 'Secret#2026')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(location()).toBe('/change-password'))
  })

  it('keeps a deep link to a filtered My Tickets URL', async () => {
    mockApi(testUser)
    renderAt('/tickets?status=OPEN')

    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeTruthy()
    expect(location()).toBe('/tickets?status=OPEN')
  })
})

describe('UI-35 My Tickets URL filters', () => {
  it('applies statusGroup and resolvedFrom from the URL as request params and chips', async () => {
    const fetchMock = mockApi(testUser)
    renderAt('/tickets?statusGroup=active&resolvedFrom=2026-10-01')

    expect(await screen.findByRole('button', { name: 'Remove filter: Active only' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Remove filter: Resolved since 1 Oct 2026' }),
    ).toBeTruthy()
    const url = lastTicketsUrl(fetchMock)
    expect(url.searchParams.get('statusGroup')).toBe('active')
    expect(url.searchParams.get('resolvedFrom')).toBe('2026-10-01')
  })

  it('shows a status drill-down in the Current Status control', async () => {
    const fetchMock = mockApi(testUser)
    renderAt('/tickets?status=WAITING_FOR_REQUESTER')

    await waitFor(() =>
      expect((screen.getByLabelText('Current Status') as HTMLSelectElement).value).toBe(
        'WAITING_FOR_REQUESTER',
      ),
    )
    expect(lastTicketsUrl(fetchMock).searchParams.get('status')).toBe('WAITING_FOR_REQUESTER')
  })

  it('applies the "View all" sort by last update', async () => {
    const fetchMock = mockApi(testUser)
    renderAt('/tickets?sortBy=updatedAt&sortDir=desc')
    await screen.findByText('TKT-2026-000101', { selector: 'a' })

    const url = lastTicketsUrl(fetchMock)
    expect(url.searchParams.get('sortBy')).toBe('updatedAt')
    expect(url.searchParams.get('sortDir')).toBe('desc')
  })

  it('removes a chip from the URL and the request', async () => {
    const fetchMock = mockApi(testUser)
    renderAt('/tickets?statusGroup=active&status=OPEN')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove filter: Active only' }))

    await waitFor(() => expect(location()).toBe('/tickets?status=OPEN'))
    await waitFor(() =>
      expect(lastTicketsUrl(fetchMock).searchParams.has('statusGroup')).toBe(false),
    )
  })

  it('writes filter and sort changes back to the URL and resets the page', async () => {
    mockApi(testUser)
    renderAt('/tickets?page=1')
    await screen.findByText('TKT-2026-000101', { selector: 'a' })

    await userEvent.selectOptions(screen.getByLabelText('Current Status'), 'OPEN')
    await waitFor(() => expect(location()).toBe('/tickets?status=OPEN'))
    await userEvent.click(await screen.findByRole('button', { name: /current status/i }))
    await waitFor(() =>
      expect(location()).toBe('/tickets?status=OPEN&sortBy=currentStatus&sortDir=asc'),
    )
  })

  it('never forwards a hand-edited requesterId, so the scope cannot widen (AC-02)', async () => {
    const fetchMock = mockApi(testUser)
    renderAt('/tickets?requesterId=99&statusGroup=active&ownerId=12')
    await screen.findByRole('button', { name: 'Remove filter: Active only' })

    const url = lastTicketsUrl(fetchMock)
    expect(url.searchParams.has('requesterId')).toBe(false)
    expect(url.searchParams.has('ownerId')).toBe(false)
    expect(url.searchParams.get('statusGroup')).toBe('active')
  })

  it('shows the safe banner with Clear filters for an invalid param, which recovers', async () => {
    mockApi(testUser, {
      onTickets: (url) =>
        url.searchParams.get('resolvedFrom') === 'someday'
          ? jsonResponse(
              {
                error: {
                  code: 'INVALID_FILTER',
                  message: 'resolvedFrom must be a date (YYYY-MM-DD).',
                  field: 'resolvedFrom',
                },
              },
              400,
            )
          : jsonResponse(queueBody(1)),
    })
    renderAt('/tickets?resolvedFrom=someday')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/YYYY-MM-DD/)
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByText('TKT-2026-000101', { selector: 'a' })).toBeTruthy()
    expect(location()).toBe('/tickets')
  })

  it('Clear filters also drops an unknown sort the route refuses', async () => {
    mockApi(testUser, {
      onTickets: (url) =>
        url.searchParams.get('sortBy') === 'password'
          ? jsonResponse(
              { error: { code: 'INVALID_FILTER', message: 'Invalid sort.', field: 'sortBy' } },
              400,
            )
          : jsonResponse(queueBody(1)),
    })
    renderAt('/tickets?sortBy=password&status=OPEN')

    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByText('TKT-2026-000101', { selector: 'a' })).toBeTruthy()
    expect(location()).toBe('/tickets')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
