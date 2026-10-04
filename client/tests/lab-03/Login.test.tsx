import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testUser } from '../helpers/auth'

// ui-spec.md §2 (FR-01, BR-01, BR-06, BR-07, AC-01, AC-02, AC-05, AC-06):
// the Login screen — validation, busy state, and every documented failure.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function mockApi(loginResponse: () => Promise<Response> | Response) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') {
      return jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'No session.' } }, 401)
    }
    if (url === '/api/auth/login') return loginResponse()
    if (url === '/api/categories') return jsonResponse([])
    if (url.startsWith('/api/tickets')) {
      return jsonResponse({
        data: [],
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
        hasAnyTickets: false,
      })
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText(/email address/i), email)
  await user.type(screen.getByLabelText(/^password/i), password)
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  return user
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Login validation', () => {
  it('shows field-level errors when submitted empty, without calling the API', async () => {
    const fetchMock = mockApi(() => jsonResponse(testUser))
    renderLogin()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/email address is required/i)).toBeTruthy()
    expect(screen.getByText(/password is required/i)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/login')
  })
})

describe('Login submit', () => {
  it('AC-01: signs in and routes to the Requester default landing screen', async () => {
    mockApi(() => jsonResponse(testUser))
    renderLogin()
    await fillAndSubmit(testUser.email, 'DevPass123!')

    expect(await screen.findByRole('heading', { name: /my tickets/i })).toBeTruthy()
  })

  it('shows the Busy state while the request is in flight', async () => {
    let resolveLogin!: (res: Response) => void
    mockApi(
      () =>
        new Promise<Response>((resolve) => {
          resolveLogin = resolve
        }),
    )
    renderLogin()
    await fillAndSubmit(testUser.email, 'DevPass123!')

    const button = await screen.findByRole('button', { name: /signing in/i })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    resolveLogin(new Response(JSON.stringify(testUser), { status: 200 }))
  })

  it('AC-05: shows the invalid-credentials banner, clears password, keeps email', async () => {
    mockApi(() =>
      jsonResponse(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
        401,
      ),
    )
    renderLogin()
    await fillAndSubmit(testUser.email, 'WrongPass123!')

    expect(await screen.findByText(/invalid email or password\. please try again\./i)).toBeTruthy()
    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).value).toBe(testUser.email)
  })

  it('AC-06: shows a distinct inactive-account banner', async () => {
    mockApi(() =>
      jsonResponse(
        { error: { code: 'INACTIVE_ACCOUNT', message: 'This account is inactive.' } },
        403,
      ),
    )
    renderLogin()
    await fillAndSubmit(testUser.email, 'DevPass123!')

    expect(
      await screen.findByText(/this account is inactive\. contact an administrator\./i),
    ).toBeTruthy()
  })

  it('shows a safe generic banner on a server/network failure, not the raw server message', async () => {
    mockApi(() =>
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Stack trace leaked here' } }, 500),
    )
    renderLogin()
    await fillAndSubmit(testUser.email, 'DevPass123!')

    expect(await screen.findByText(/something went wrong\. please try again\./i)).toBeTruthy()
    expect(screen.queryByText(/stack trace/i)).toBeFalsy()
  })

  it('AC-02: routes a mustChangePassword account straight to Change Password', async () => {
    mockApi(() => jsonResponse({ ...testUser, mustChangePassword: true }))
    renderLogin()
    await fillAndSubmit(testUser.email, 'DevPass123!')

    expect(await screen.findByRole('heading', { name: /change your password/i })).toBeTruthy()
  })
})

describe('Login forgot-password link', () => {
  it('is present but inert, with an explanatory tooltip', async () => {
    mockApi(() => jsonResponse(testUser))
    renderLogin()

    const link = await screen.findByRole('button', { name: /forgot your password/i })
    expect((link as HTMLButtonElement).disabled).toBe(true)
    expect(link.getAttribute('title')).toMatch(/administrator/i)
  })
})
