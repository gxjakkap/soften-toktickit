import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testAdminUser, testStaffUser, testUser } from '../helpers/auth'

// specification.md §6/§12-14, ui-spec.md §1: the authenticated shell's
// role-scoped navigation and the client's route guards — unauthenticated
// redirect, wrong-role forbidden state, and logout clearing access.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

const EMPTY_TICKETS = {
  data: [],
  page: 1,
  pageSize: 10,
  totalCount: 0,
  totalPages: 0,
  hasAnyTickets: false,
}

function mockApi(user: typeof testUser | null) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') {
      return user
        ? jsonResponse(user)
        : jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'No session.' } }, 401)
    }
    if (url === '/api/auth/logout' && init?.method === 'POST') {
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (url === '/api/categories') return jsonResponse([])
    if (url.startsWith('/api/tickets')) return jsonResponse(EMPTY_TICKETS)
    if (url.startsWith('/api/staff/tickets')) {
      return jsonResponse({ ...EMPTY_TICKETS, data: [] })
    }
    if (url.startsWith('/api/admin/users')) return jsonResponse({ data: [], totalCount: 0 })
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Unauthenticated access', () => {
  it('redirects a direct URL to a protected screen to Login', async () => {
    mockApi(null)
    renderAt('/staff/tickets')

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeTruthy()
  })
})

describe('Role-scoped navigation', () => {
  it('shows only Requester destinations for a Requester', async () => {
    mockApi(testUser)
    renderAt('/tickets')
    await screen.findByRole('heading', { name: /my tickets/i })

    const nav = screen.getByRole('navigation', { name: /main/i })
    expect(within(nav).getByRole('link', { name: /my tickets/i })).toBeTruthy()
    expect(within(nav).getByRole('link', { name: /create ticket/i })).toBeTruthy()
    expect(within(nav).queryByRole('link', { name: /ticket queue/i })).toBeFalsy()
    expect(within(nav).queryByRole('link', { name: /user management/i })).toBeFalsy()
  })

  it('shows only the Ticket Queue for IT Staff', async () => {
    mockApi(testStaffUser)
    renderAt('/staff/tickets')
    await screen.findByRole('heading', { name: /ticket queue/i })

    const nav = screen.getByRole('navigation', { name: /main/i })
    expect(within(nav).getByRole('link', { name: /ticket queue/i })).toBeTruthy()
    expect(within(nav).queryByRole('link', { name: /my tickets/i })).toBeFalsy()
    expect(within(nav).queryByRole('link', { name: /user management/i })).toBeFalsy()
  })

  it('shows only User Management for an Administrator', async () => {
    mockApi(testAdminUser)
    renderAt('/admin/users')
    await screen.findByRole('heading', { name: /user management/i })

    const nav = screen.getByRole('navigation', { name: /main/i })
    expect(within(nav).getByRole('link', { name: /user management/i })).toBeTruthy()
    expect(within(nav).queryByRole('link', { name: /my tickets/i })).toBeFalsy()
    expect(within(nav).queryByRole('link', { name: /ticket queue/i })).toBeFalsy()
  })
})

describe('Wrong-role direct URL access', () => {
  it('shows the forbidden state, not an error banner, for a Requester hitting the Queue', async () => {
    mockApi(testUser)
    renderAt('/staff/tickets')

    expect(await screen.findByTestId('queue-forbidden')).toBeTruthy()
  })

  it('shows the forbidden state for IT Staff hitting My Tickets', async () => {
    mockApi(testStaffUser)
    renderAt('/tickets')

    expect(await screen.findByTestId('my-tickets-forbidden')).toBeTruthy()
    const link = screen.getByRole('link', { name: /back to your home page/i })
    expect(link.getAttribute('href')).toBe('/staff/tickets')
  })

  it('shows the forbidden state for a Requester hitting User Management', async () => {
    mockApi(testUser)
    renderAt('/admin/users')

    expect(await screen.findByTestId('users-forbidden')).toBeTruthy()
  })
})

describe('Logout', () => {
  it('clears the session and blocks further access to protected routes', async () => {
    mockApi(testUser)
    renderAt('/tickets')
    await screen.findByRole('heading', { name: /my tickets/i })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /logout/i }))

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeTruthy()
    expect(screen.queryByTestId('auth-scope')).toBeFalsy()
  })
})
