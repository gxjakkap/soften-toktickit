import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testAdminUser, testStaffUser } from '../helpers/auth'
import type { AdminUser } from '../../src/types'

// UI-7 (ui-spec.md §7), api-spec.md §5 (FR-20..23, FR-25, FR-26, BR-35, BR-36,
// BR-38, BR-39, AC-27..AC-29, AC-31, AC-32, AC-35): Administrator User
// Management — list, search/filter, create, edit, set password, and the
// disabled self/last-Administrator controls.

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

const seeded: AdminUser[] = [
  {
    id: 21,
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    role: 'ADMINISTRATOR',
    isActive: true,
  },
  {
    id: 12,
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    role: 'IT_STAFF',
    isActive: true,
  },
  {
    id: 3,
    name: 'Michael Brown',
    email: 'michael.brown@example.com',
    role: 'REQUESTER',
    isActive: true,
  },
  {
    id: 4,
    name: 'Patricia Reyes',
    email: 'patricia.reyes@example.com',
    role: 'REQUESTER',
    isActive: false,
  },
]

type Handlers = {
  users?: AdminUser[]
  onList?: (url: URL) => Response | Promise<Response> | undefined
  onWrite?: (method: string, url: string, body: Record<string, unknown>) => Promise<Response>
}

function mockApi(me = testAdminUser, h: Handlers = {}) {
  const users = h.users ?? seeded
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return json(me)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url.startsWith('/api/admin/users')) {
      const u = new URL(url, 'http://localhost')
      const custom = h.onList?.(u)
      if (custom) return Promise.resolve(custom)
      const search = (u.searchParams.get('search') ?? '').toLowerCase()
      const role = u.searchParams.get('role')
      const data = users.filter(
        (x) =>
          (!role || x.role === role) &&
          (!search || x.name.toLowerCase().includes(search) || x.email.includes(search)),
      )
      return json({ data, totalCount: data.length })
    }
    if (url.startsWith('/api/admin/users') && h.onWrite) {
      return h.onWrite(method, url, JSON.parse(String(init?.body ?? '{}')))
    }
    return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
}

// jsdom ignores the CSS that swaps the table for mobile cards, so both render.
const inTable = () => within(screen.getByRole('table'))
const findInTable = (text: string) => waitFor(() => inTable().getByText(text))
const queryInTable = (text: string) => screen.queryByRole('table') && inTable().queryByText(text)
const tableRow = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
const writes = (m: ReturnType<typeof mockApi>) =>
  m.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('forbidden state (AC-35)', () => {
  it('shows the full-page forbidden state to IT Staff and makes no admin request', async () => {
    const m = mockApi(testStaffUser)
    renderScreen()
    expect(await screen.findByTestId('users-forbidden')).toBeTruthy()
    expect(m.mock.calls.some(([u]) => String(u).startsWith('/api/admin'))).toBe(false)
    expect(screen.queryByRole('button', { name: /create user/i })).toBeNull()
  })
})

describe('list (AC-27, BR-39)', () => {
  it('renders every seeded user with name, email, role, status and an Edit action', async () => {
    mockApi()
    renderScreen()
    const row = await waitFor(() => tableRow('Sarah Johnson'))
    expect(within(row).getByText('sarah.johnson@example.com')).toBeTruthy()
    expect(within(row).getByText('IT Staff')).toBeTruthy()
    expect(within(row).getByText('Active')).toBeTruthy()
    expect(within(tableRow('Patricia Reyes')).getByText('Inactive')).toBeTruthy()
    expect(within(tableRow('Alex Morgan')).getByText('Administrator')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit Michael Brown' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull()
  })

  it('shows User Management in the Administrator nav only', async () => {
    mockApi()
    renderScreen()
    expect(await screen.findByRole('link', { name: 'User Management' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Ticket Queue' })).toBeNull()
  })

  it('shows a safe error with Retry when loading fails', async () => {
    let fail = true
    mockApi(testAdminUser, {
      onList: () =>
        fail
          ? new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x' } }), {
              status: 500,
            })
          : undefined,
    })
    renderScreen()
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to load users')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findInTable('Michael Brown')).toBeTruthy()
  })
})

describe('search and role filter (AC-28, BR-38)', () => {
  it('searches by name or email as the Administrator types', async () => {
    const m = mockApi()
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.type(screen.getByLabelText('Search'), 'sarah')
    await waitFor(() => expect(queryInTable('Michael Brown')).toBeNull())
    expect(inTable().getByText('Sarah Johnson')).toBeTruthy()
    expect(m.mock.calls.some(([u]) => String(u).includes('search=sarah'))).toBe(true)
  })

  it('filters by role and shows a removable chip', async () => {
    const m = mockApi()
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.click(screen.getByRole('button', { name: /filters/i }))
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'REQUESTER')
    await waitFor(() => expect(queryInTable('Sarah Johnson')).toBeNull())
    expect(inTable().getByText('Patricia Reyes')).toBeTruthy()
    expect(m.mock.calls.some(([u]) => String(u).includes('role=REQUESTER'))).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Role: Requester' }))
    expect(await findInTable('Sarah Johnson')).toBeTruthy()
  })

  it('shows the no-results state with Clear Filters', async () => {
    mockApi()
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.type(screen.getByLabelText('Search'), 'nobody-matches')
    expect(await screen.findByText('No users match your search.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
    expect(await findInTable('Michael Brown')).toBeTruthy()
  })
})

describe('create user (AC-29, BR-10, BR-15, BR-33)', () => {
  it('validates the form before sending anything', async () => {
    const m = mockApi()
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    const panel = screen.getByTestId('user-panel')
    await userEvent.type(within(panel).getByLabelText(/email address/i), 'nope')
    await userEvent.type(within(panel).getByLabelText(/initial password/i), 'NoSpecial123')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save User' }))

    expect(within(panel).getByText('Name is required.')).toBeTruthy()
    expect(within(panel).getByText('Enter a valid email address.')).toBeTruthy()
    expect(within(panel).getByText('Choose a role.')).toBeTruthy()
    expect(within(panel).getByText('Password does not meet the rules below.')).toBeTruthy()
    expect(
      (within(panel).getByRole('switch', { name: 'Active' }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(writes(m)).toHaveLength(0)
  })

  it('offers exactly one single-select role, no multi-select', async () => {
    mockApi()
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    const select = within(screen.getByTestId('user-panel')).getByLabelText(/role/i)
    expect(select.hasAttribute('multiple')).toBe(false)
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select a role', 'Requester', 'IT Staff', 'Administrator'])
  })

  it('submits, closes the panel, reloads the list and shows a success message', async () => {
    const users = [...seeded]
    const m = mockApi(testAdminUser, {
      users,
      onWrite: async (_method, _url, body) => {
        users.push({
          id: 99,
          name: String(body.name),
          email: String(body.email),
          role: 'IT_STAFF',
          isActive: true,
        })
        return json({ id: 99, ...body }, 201)
      },
    })
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    const panel = screen.getByTestId('user-panel')
    await userEvent.type(within(panel).getByLabelText(/full name/i), 'Alex Thompson')
    await userEvent.type(within(panel).getByLabelText(/email address/i), 'alex.t@example.com')
    await userEvent.selectOptions(within(panel).getByLabelText(/role/i), 'IT_STAFF')
    await userEvent.type(within(panel).getByLabelText(/initial password/i), 'N3w!Passw0rd')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save User' }))

    expect(await screen.findByText('User created.')).toBeTruthy()
    expect(screen.queryByTestId('user-panel')).toBeNull()
    expect(await findInTable('Alex Thompson')).toBeTruthy()
    const post = writes(m)[0]!
    expect(post[0]).toBe('/api/admin/users')
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      name: 'Alex Thompson',
      email: 'alex.t@example.com',
      role: 'IT_STAFF',
      isActive: true,
      initialPassword: 'N3w!Passw0rd',
    })
  })

  it('puts a duplicate-email conflict under Email Address and keeps the input', async () => {
    mockApi(testAdminUser, {
      onWrite: () =>
        json(
          {
            error: {
              code: 'DUPLICATE_EMAIL',
              message: 'A user with this email already exists.',
              field: 'email',
            },
          },
          409,
        ),
    })
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    const panel = screen.getByTestId('user-panel')
    await userEvent.type(within(panel).getByLabelText(/full name/i), 'Dup')
    await userEvent.type(
      within(panel).getByLabelText(/email address/i),
      'michael.brown@example.com',
    )
    await userEvent.selectOptions(within(panel).getByLabelText(/role/i), 'REQUESTER')
    await userEvent.type(within(panel).getByLabelText(/initial password/i), 'N3w!Passw0rd')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save User' }))

    expect(await within(panel).findByText('A user with this email already exists.')).toBeTruthy()
    expect((within(panel).getByLabelText(/email address/i) as HTMLInputElement).value).toBe(
      'michael.brown@example.com',
    )
    expect(
      within(panel)
        .getByLabelText(/email address/i)
        .getAttribute('aria-invalid'),
    ).toBe('true')
  })

  it('shows a safe banner for a forbidden or server failure and keeps the form open', async () => {
    mockApi(testAdminUser, {
      onWrite: () =>
        json({ error: { code: 'FORBIDDEN', message: 'You do not have permission.' } }, 403),
    })
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    const panel = screen.getByTestId('user-panel')
    await userEvent.type(within(panel).getByLabelText(/full name/i), 'Pat')
    await userEvent.type(within(panel).getByLabelText(/email address/i), 'pat@example.com')
    await userEvent.selectOptions(within(panel).getByLabelText(/role/i), 'REQUESTER')
    await userEvent.type(within(panel).getByLabelText(/initial password/i), 'N3w!Passw0rd')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save User' }))
    expect((await within(panel).findByRole('alert')).textContent).toContain(
      'You do not have permission.',
    )
    expect((within(panel).getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Pat')
  })

  it('Cancel closes the panel and discards input', async () => {
    mockApi()
    renderScreen()
    await findInTable('Michael Brown')
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    await userEvent.type(screen.getByLabelText(/full name/i), 'Gone')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('user-panel')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('')
  })
})

describe('edit user (FR-22)', () => {
  it('pre-fills the form and sends only the changed fields', async () => {
    const m = mockApi(testAdminUser, {
      onWrite: (_m, _u, body) => json({ id: 12, ...body }),
    })
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Sarah Johnson' }))
    const panel = screen.getByTestId('user-panel')
    expect((within(panel).getByLabelText(/full name/i) as HTMLInputElement).value).toBe(
      'Sarah Johnson',
    )
    expect((within(panel).getByLabelText(/role/i) as HTMLInputElement).value).toBe('IT_STAFF')

    await userEvent.click(within(panel).getByRole('switch', { name: 'Active' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByText('User updated.')).toBeTruthy()
    const patch = writes(m)[0]!
    expect(patch[0]).toBe('/api/admin/users/12')
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ isActive: false })
  })

  it('shows the duplicate-email error under Email Address on edit', async () => {
    mockApi(testAdminUser, {
      onWrite: () =>
        json(
          {
            error: {
              code: 'DUPLICATE_EMAIL',
              message: 'A user with this email already exists.',
              field: 'email',
            },
          },
          409,
        ),
    })
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Sarah Johnson' }))
    const panel = screen.getByTestId('user-panel')
    const emailInput = within(panel).getByLabelText(/email address/i)
    await userEvent.clear(emailInput)
    await userEvent.type(emailInput, 'michael.brown@example.com')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save Changes' }))
    expect(await within(panel).findByText('A user with this email already exists.')).toBeTruthy()
  })

  it('shows the server’s safety-rule message when it rejects the edit', async () => {
    mockApi(testAdminUser, {
      onWrite: () =>
        json(
          {
            error: {
              code: 'LAST_ADMINISTRATOR',
              message: 'At least one active Administrator is required.',
            },
          },
          409,
        ),
    })
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Michael Brown' }))
    const panel = screen.getByTestId('user-panel')
    await userEvent.selectOptions(within(panel).getByLabelText(/role/i), 'IT_STAFF')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save Changes' }))
    expect((await within(panel).findByRole('alert')).textContent).toContain(
      'At least one active Administrator is required.',
    )
  })
})

describe('self-deactivation and last-Administrator controls (FR-25, FR-26, AC-31, AC-32)', () => {
  it('disables the Active toggle on the Administrator’s own row, with an explanation', async () => {
    const two = [
      ...seeded,
      {
        id: 50,
        name: 'Zoe Admin',
        email: 'zoe@example.com',
        role: 'ADMINISTRATOR' as const,
        isActive: true,
      },
    ]
    mockApi(testAdminUser, { users: two })
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Alex Morgan' }))
    const panel = screen.getByTestId('user-panel')
    expect(
      (within(panel).getByRole('switch', { name: 'Active' }) as HTMLInputElement).disabled,
    ).toBe(true)
    expect(within(panel).getByText("You can't deactivate your own account.")).toBeTruthy()
    // Another active Administrator exists, so the Role select stays usable.
    await waitFor(() =>
      expect((within(panel).getByLabelText(/role/i) as HTMLInputElement).disabled).toBe(false),
    )
  })

  it('disables Active and Role for the only active Administrator', async () => {
    mockApi()
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Alex Morgan' }))
    const panel = screen.getByTestId('user-panel')
    await waitFor(() =>
      expect((within(panel).getByLabelText(/role/i) as HTMLInputElement).disabled).toBe(true),
    )
    expect(
      (within(panel).getByRole('switch', { name: 'Active' }) as HTMLInputElement).disabled,
    ).toBe(true)
    // The toggle carries the self-row copy; the Role select carries the last-Administrator copy.
    expect(within(panel).getByText("You can't deactivate your own account.")).toBeTruthy()
    expect(within(panel).getByText('At least one active Administrator is required.')).toBeTruthy()
  })

  it('leaves other users’ Active toggle enabled', async () => {
    mockApi()
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Sarah Johnson' }))
    const panel = screen.getByTestId('user-panel')
    expect(
      (within(panel).getByRole('switch', { name: 'Active' }) as HTMLInputElement).disabled,
    ).toBe(false)
    expect(within(panel).queryByText("You can't deactivate your own account.")).toBeNull()
  })
})

describe('set new initial password (FR-23, BR-37)', () => {
  it('is collapsed by default and absent when creating', async () => {
    mockApi()
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Sarah Johnson' }))
    expect(screen.queryByLabelText('New Initial Password')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    expect(screen.queryByRole('button', { name: 'Set New Password' })).toBeNull()
  })

  it('rejects a weak password locally, then sets a valid one', async () => {
    const m = mockApi(testAdminUser, {
      onWrite: () => json({ id: 12, mustChangePassword: true }),
    })
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Sarah Johnson' }))
    await userEvent.click(screen.getByRole('button', { name: 'Set New Password' }))
    const field = screen.getByLabelText('New Initial Password')

    await userEvent.type(field, 'weak')
    await userEvent.click(screen.getByRole('button', { name: 'Save Password' }))
    expect(screen.getByText('Password does not meet the rules below.')).toBeTruthy()
    expect(writes(m)).toHaveLength(0)

    await userEvent.clear(field)
    await userEvent.type(field, 'An0ther!Pass')
    await userEvent.click(screen.getByRole('button', { name: 'Save Password' }))
    expect(await screen.findByText(/must change it at next login/)).toBeTruthy()
    const call = writes(m)[0]!
    expect(call[0]).toBe('/api/admin/users/12/password')
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      newPassword: 'An0ther!Pass',
    })
    expect((field as HTMLInputElement).value).toBe('')
  })
})
