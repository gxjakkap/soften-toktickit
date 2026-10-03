import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testUser } from '../helpers/auth'

// ui-spec.md §3 (FR-02, BR-02, BR-10, BR-11, AC-02): the mandatory
// first-login Change Password screen — live rule checklist, mismatch
// validation, and the success/failure paths.

const mustChangeUser = { ...testUser, mustChangePassword: true }

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function mockApi(changePasswordResponse?: () => Promise<Response> | Response) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return jsonResponse(mustChangeUser)
    if (url === '/api/auth/change-password') {
      if (!changePasswordResponse) throw new Error('no change-password handler configured')
      return changePasswordResponse()
    }
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

function renderChangePassword() {
  return render(
    <MemoryRouter initialEntries={['/change-password']}>
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

describe('AC-02: the mandatory gate', () => {
  it('redirects a user who does not need a password change away from this screen', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/auth/me') return jsonResponse(testUser)
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
    renderChangePassword()

    expect(await screen.findByRole('heading', { name: /my tickets/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /change your password/i })).toBeFalsy()
  })
})

describe('Live password-rule checklist', () => {
  it('marks each rule met as the New Password field satisfies it', async () => {
    mockApi()
    renderChangePassword()
    const user = userEvent.setup()

    const newPasswordInput = await screen.findByLabelText(/^new password/i, { selector: 'input' })
    await user.type(newPasswordInput, 'abcdefgh')

    const list = screen.getByRole('list', { name: /password rules/i })
    expect(
      within(list)
        .getByText(/at least 8 characters/i)
        .closest('li')?.className,
    ).toContain('is-met')
    expect(
      within(list)
        .getByText(/an uppercase letter/i)
        .closest('li')?.className,
    ).not.toContain('is-met')

    await user.type(newPasswordInput, 'IJ1!')
    expect(
      within(list)
        .getByText(/an uppercase letter/i)
        .closest('li')?.className,
    ).toContain('is-met')
    expect(
      within(list)
        .getByText(/a number/i)
        .closest('li')?.className,
    ).toContain('is-met')
    expect(
      within(list)
        .getByText(/a special character/i)
        .closest('li')?.className,
    ).toContain('is-met')
  })
})

describe('Confirm password mismatch', () => {
  it('shows a live mismatch error before submit', async () => {
    mockApi()
    renderChangePassword()
    const user = userEvent.setup()

    await user.type(
      await screen.findByLabelText(/^new password/i, { selector: 'input' }),
      'N3w!Passw0rd',
    )
    await user.type(
      screen.getByLabelText(/^confirm new password/i, { selector: 'input' }),
      'N3w!Passw0rX',
    )

    expect(await screen.findByText(/passwords do not match/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /continue/i })).toHaveProperty('disabled', true)
  })
})

describe('Submit', () => {
  async function fillValidForm() {
    const user = userEvent.setup()
    await user.type(
      await screen.findByLabelText(/^current \(temporary\) password/i, { selector: 'input' }),
      'DevPass123!',
    )
    await user.type(screen.getByLabelText(/^new password/i, { selector: 'input' }), 'N3w!Passw0rd')
    await user.type(
      screen.getByLabelText(/^confirm new password/i, { selector: 'input' }),
      'N3w!Passw0rd',
    )
    return user
  }

  it('AC-02: on success, lands on the role default screen with no confirmation screen', async () => {
    mockApi(() => jsonResponse({ ...testUser, mustChangePassword: false }))
    renderChangePassword()
    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('heading', { name: /my tickets/i })).toBeTruthy()
  })

  it('shows a field-level error under Current password when it is wrong', async () => {
    mockApi(() =>
      jsonResponse(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Current password is incorrect.',
            field: 'currentPassword',
          },
        },
        401,
      ),
    )
    renderChangePassword()
    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/current password is incorrect\./i)).toBeTruthy()
  })

  it('disables Continue and shows a live error when New equals Current', async () => {
    mockApi()
    renderChangePassword()
    const user = userEvent.setup()

    await user.type(
      await screen.findByLabelText(/^current \(temporary\) password/i, { selector: 'input' }),
      'DevPass123!',
    )
    await user.type(screen.getByLabelText(/^new password/i, { selector: 'input' }), 'DevPass123!')

    expect(
      await screen.findByText(/new password must be different from the current password/i),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /continue/i })).toHaveProperty('disabled', true)
  })
})
