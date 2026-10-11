// UI-32, UI-33, UI-34, UI-36, UI-37 — AC-36, AC-47 (IT Staff and Administrator parts; Issue #68 adds the Requester ones)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testAdminUser, testStaffUser } from '../helpers/auth'
import type { AuthUser } from '../../src/types'

// Lab 4 ui-spec.md §1, §2.5, §7 (FR-16, FR-17): Dashboard navigation and
// landing for IT Staff and Administrators, and the URL-driven filters that
// make the Ticket Queue and User Management work as drill-down targets.

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
  options: { onQueue?: (url: URL) => Promise<Response>; loginAs?: AuthUser } = {},
) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') {
      return user
        ? jsonResponse(user)
        : jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'No session.' } }, 401)
    }
    if (url === '/api/auth/login' && init?.method === 'POST') return jsonResponse(options.loginAs)
    if (url === '/api/dashboard/staff') return DASHBOARD_PENDING
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
})
