import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testAdminUser, testStaffUser, testUser } from '../helpers/auth'
import type { StaffTicketDetail } from '../../src/types'

// UI-39..UI-50 — AC-34, AC-37, AC-41, AC-42, AC-44: docs/lab-04 ui-spec.md
// §5, §11 (FR-19, FR-20, FR-21, FR-24). Issue #69 hardening fixes: section
// order, shared feedback states, busy state, kept input, and accessible
// modals.

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function stubApi(user: unknown, handler: Handler) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return json(user)
    const res = await handler(url, init)
    if (res) return res
    throw new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
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

function staffDetail(overrides: Partial<StaffTicketDetail> = {}): StaffTicketDetail {
  return {
    id: 101,
    ticketNumber: 'TKT-2026-000101',
    requester: { id: 7, name: 'Priya Shah' },
    ownerName: null,
    ownerId: null,
    category: { id: 1, name: 'Hardware' },
    relatedSystem: { id: 1, name: 'Corporate Laptop' },
    requestedPriority: 'MEDIUM',
    itPriority: 'MEDIUM',
    summary: 'Laptop battery drains quickly',
    description: 'The battery drains much faster than usual even when idle.',
    currentStatus: 'IN_PROGRESS',
    requesterConfirmedResolvedAt: null,
    createdAt: '2026-10-01T02:00:00.000Z',
    updatedAt: '2026-10-01T02:00:00.000Z',
    attachments: [],
    comments: [],
    version: 3,
    resolvedAt: null,
    resolutionGate: { canResolve: true, reasons: [] },
    ...overrides,
  }
}

// The read endpoints every staff Ticket Detail render makes.
const staffReads =
  (detail: StaffTicketDetail | Response): Handler =>
  (url, init) => {
    if (init?.method) return undefined
    if (url === '/api/staff/it-staff-users') return json([])
    if (url === '/api/staff/tickets/101') return detail instanceof Response ? detail : json(detail)
    if (url === '/api/staff/tickets/101/status-history') return json({ data: [] })
    if (url === '/api/staff/tickets/101/actions') return json({ data: [] })
    return undefined
  }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-39: IT Staff Ticket Detail section order (ui-spec.md §5)', () => {
  it('places Attachments after Internal Notes and before Status History', async () => {
    stubApi(testStaffUser, staffReads(staffDetail()))
    renderAt('/staff/tickets/101')
    await screen.findByRole('heading', { level: 1, name: 'Laptop battery drains quickly' })
    const headings = within(screen.getByTestId('auth-scope'))
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.replace(/ \(\d+\)$/, ''))
    expect(headings).toEqual([
      'Ownership, Priority & Status',
      'Actions Taken',
      'Public Comments',
      'Internal Notes',
      'Attachments',
      'Status History',
    ])
  })
})

const apiError = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status)

describe('UI-40: shared not-found and forbidden states (ui-spec.md §11)', () => {
  it('shows the not-found card as the page heading with one way back', async () => {
    stubApi(testStaffUser, staffReads(apiError(404, 'NOT_FOUND', 'Ticket not found.')))
    renderAt('/staff/tickets/101')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ticket not found.' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Back to Ticket Queue' })).toHaveLength(1)
  })

  it('shows the forbidden state, with a heading, when the API answers 403', async () => {
    stubApi(testStaffUser, staffReads(apiError(403, 'FORBIDDEN', 'Not allowed.')))
    renderAt('/staff/tickets/101')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: "You don't have access to this page.",
      }),
    ).toBeTruthy()
    expect(screen.queryByText('Not allowed.')).toBeNull()
  })

  it('shows the forbidden state on a list screen when the API answers 403', async () => {
    stubApi(testStaffUser, (url) => {
      if (url === '/api/categories') return json([])
      if (url.startsWith('/api/staff/tickets?')) return apiError(403, 'FORBIDDEN', 'Not allowed.')
      return undefined
    })
    renderAt('/staff/tickets')
    expect(await screen.findByTestId('queue-forbidden')).toBeTruthy()
  })
})

describe('UI-41: invalid drill-down filter offers one Clear filters (ui-spec.md §2.5)', () => {
  it('hides the header Clear Filters while the banner offers its own', async () => {
    stubApi(testStaffUser, (url) => {
      if (url === '/api/categories') return json([])
      if (url.startsWith('/api/staff/tickets?'))
        return apiError(400, 'INVALID_FILTER', 'followUp is not a valid filter.')
      return undefined
    })
    renderAt('/staff/tickets?followUp=bogus')
    expect(
      await screen.findByText('This link has a filter the Ticket Queue does not recognize.'),
    ).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /clear filters/i })).toHaveLength(1)
  })
})

describe('UI-42: password reset mid-session (Lab 3 FR-02)', () => {
  it('sends the user to Change Password when the API says a change is required', async () => {
    stubApi(testStaffUser, (url) => {
      if (url === '/api/categories') return json([])
      if (url.startsWith('/api/staff/tickets?'))
        return apiError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must change your password.')
      return undefined
    })
    renderAt('/staff/tickets')
    expect(await screen.findByRole('heading', { name: 'Change Your Password' })).toBeTruthy()
  })
})

const serverError = () => apiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')

describe('UI-43: comment composers are busy while posting and keep input on failure (FR-20, FR-21)', () => {
  it.each([
    ['Add a comment', 'Post Comment', 'PUBLIC'],
    ['Add an internal note', 'Post Internal Note', 'INTERNAL'],
  ])('%s: one request per click, busy state, draft kept after a 500', async (label, button) => {
    let release!: (r: Response) => void
    const posts: string[] = []
    stubApi(testStaffUser, (url, init) => {
      if (init?.method === 'POST' && url === '/api/staff/tickets/101/comments') {
        posts.push(String(init.body))
        return new Promise<Response>((resolve) => (release = resolve))
      }
      return staffReads(staffDetail())(url, init)
    })
    renderAt('/staff/tickets/101')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(label), 'Rebooted the dock, still flaky.')
    const submit = screen.getByRole('button', { name: button })
    await user.click(submit)
    await user.click(submit)

    const busy = await screen.findByRole('button', { name: 'Posting…' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(busy).toHaveProperty('disabled', true)
    expect(posts).toHaveLength(1)

    release(serverError())
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Something went wrong. Please try again.',
    )
    expect((screen.getByLabelText(label) as HTMLTextAreaElement).value).toBe(
      'Rebooted the dock, still flaky.',
    )
  })
})

describe('UI-44: Requester comment keeps its draft after a network failure (FR-20)', () => {
  it('shows the safe message and keeps the text', async () => {
    stubApi(testUser, (url, init) => {
      if (init?.method === 'POST') return Promise.reject(new TypeError('Failed to fetch'))
      if (url === '/api/tickets/101') return json({ ...staffDetail(), comments: [] })
      if (url === '/api/tickets/101/status-history') return json({ data: [] })
      if (url === '/api/tickets/101/actions') return json({ data: [] })
      return undefined
    })
    renderAt('/tickets/101')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Add a comment'), 'Still broken after lunch.')
    await user.click(screen.getByRole('button', { name: 'Post Comment' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Something went wrong. Please try again.',
    )
    expect((screen.getByLabelText('Add a comment') as HTMLTextAreaElement).value).toBe(
      'Still broken after lunch.',
    )
  })
})

describe('UI-45: admin user form is busy while saving and keeps input on failure (FR-20, FR-21)', () => {
  it('keeps every field after a 500 and sends one request per click', async () => {
    let release!: (r: Response) => void
    let posts = 0
    stubApi(testAdminUser, (url, init) => {
      if (!init?.method && url.startsWith('/api/admin/users'))
        return json({ data: [], totalCount: 0 })
      if (init?.method === 'POST' && url === '/api/admin/users') {
        posts++
        return new Promise<Response>((resolve) => (release = resolve))
      }
      return undefined
    })
    renderAt('/admin/users')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /create user/i }))
    const panel = screen.getByTestId('user-panel')
    await user.type(within(panel).getByLabelText(/full name/i), 'Dana Lee')
    await user.type(within(panel).getByLabelText(/email address/i), 'dana.lee@example.com')
    await user.selectOptions(within(panel).getByLabelText(/^role/i), 'IT_STAFF')
    await user.type(within(panel).getByLabelText(/initial password/i), 'N3w!Passw0rd')
    const save = within(panel).getByRole('button', { name: 'Save User' })
    await user.click(save)
    await user.click(save)

    const busy = within(panel).getByRole('button', { name: 'Saving…' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(posts).toBe(1)

    release(serverError())
    await within(panel).findByRole('alert')
    expect((within(panel).getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Dana Lee')
    expect((within(panel).getByLabelText(/email address/i) as HTMLInputElement).value).toBe(
      'dana.lee@example.com',
    )
    expect((within(panel).getByLabelText(/^role/i) as HTMLSelectElement).value).toBe('IT_STAFF')
  })
})

describe('UI-46: Change Password keeps the fields after a server failure (FR-20)', () => {
  it('keeps what the user typed and shows the safe message', async () => {
    stubApi({ ...testUser, mustChangePassword: true }, (url, init) =>
      init?.method === 'POST' && url === '/api/auth/change-password' ? serverError() : undefined,
    )
    renderAt('/change-password')
    const user = userEvent.setup()
    const current = await screen.findByLabelText(/^current \(temporary\) password/i, {
      selector: 'input',
    })
    await user.type(current, 'DevPass123!')
    await user.type(screen.getByLabelText(/^new password/i, { selector: 'input' }), 'N3w!Passw0rd')
    await user.type(
      screen.getByLabelText(/^confirm new password/i, { selector: 'input' }),
      'N3w!Passw0rd',
    )
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy(),
    )
    expect((current as HTMLInputElement).value).toBe('DevPass123!')
    expect(
      (screen.getByLabelText(/^new password/i, { selector: 'input' }) as HTMLInputElement).value,
    ).toBe('N3w!Passw0rd')
  })
})

describe('UI-47: confirmation dialogs manage focus (ui-spec.md §9)', () => {
  it('moves focus in, keeps Tab inside, closes on Esc, and returns focus', async () => {
    stubApi(testUser, (url, init) => {
      if (init?.method) return undefined
      if (url === '/api/tickets/101') return json({ ...staffDetail(), comments: [] })
      if (url === '/api/tickets/101/status-history') return json({ data: [] })
      if (url === '/api/tickets/101/actions') return json({ data: [] })
      return undefined
    })
    renderAt('/tickets/101')
    const user = userEvent.setup()
    const trigger = await screen.findByRole('button', { name: 'Problem Appears Resolved' })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Problem Appears Resolved' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    for (let i = 0; i < 5; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('UI-50: confirmation dialogs stay open while their request is in flight (FR-20, FR-21)', () => {
  // Cancel, the close button, and Esc all wait for the request, so a failure
  // lands in the dialog that caused it instead of vanishing with it.
  async function expectLocked(dialog: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
    expect(
      (within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (within(dialog).getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await user.keyboard('{Escape}')
    expect(dialog.isConnected).toBe(true)
  }

  it('Remove Attachment keeps the dialog, the reason, and shows the error after a 500', async () => {
    let release!: (r: Response) => void
    const attachment = {
      id: 9,
      ticketId: 101,
      originalFileName: 'battery.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      uploadedAt: '2026-10-01T02:00:00.000Z',
      isRemoved: false,
    }
    stubApi(testUser, (url, init) => {
      if (init?.method === 'PATCH' && url === '/api/attachments/9/remove')
        return new Promise<Response>((resolve) => (release = resolve))
      if (init?.method) return undefined
      if (url === '/api/tickets/101')
        return json({ ...staffDetail({ attachments: [attachment] }), comments: [] })
      if (url === '/api/tickets/101/status-history') return json({ data: [] })
      if (url === '/api/tickets/101/actions') return json({ data: [] })
      return undefined
    })
    renderAt('/tickets/101')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Attachment' })
    await user.type(within(dialog).getByLabelText(/reason/i), 'Wrong file')
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await expectLocked(dialog, user)

    release(serverError())
    expect(await within(dialog).findByText('Something went wrong. Please try again.')).toBeTruthy()
    expect((within(dialog).getByLabelText(/reason/i) as HTMLTextAreaElement).value).toBe(
      'Wrong file',
    )
    expect(
      (within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('Problem Appears Resolved keeps the dialog and shows the error after a 500', async () => {
    let release!: (r: Response) => void
    stubApi(testUser, (url, init) => {
      if (init?.method === 'PATCH' && url === '/api/tickets/101/resolved')
        return new Promise<Response>((resolve) => (release = resolve))
      if (init?.method) return undefined
      if (url === '/api/tickets/101') return json({ ...staffDetail(), comments: [] })
      if (url === '/api/tickets/101/status-history') return json({ data: [] })
      if (url === '/api/tickets/101/actions') return json({ data: [] })
      return undefined
    })
    renderAt('/tickets/101')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Problem Appears Resolved' }))
    const dialog = screen.getByRole('dialog', { name: 'Problem Appears Resolved' })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await expectLocked(dialog, user)

    release(serverError())
    expect(await within(dialog).findByText('Something went wrong. Please try again.')).toBeTruthy()
    expect(
      (within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})

describe('UI-48: Status and priority badges carry text and an icon (ui-spec.md §12)', () => {
  it('renders an icon in every status and priority badge on Ticket Detail', async () => {
    stubApi(testStaffUser, staffReads(staffDetail({ currentStatus: 'NEW', itPriority: 'HIGH' })))
    renderAt('/staff/tickets/101')
    for (const testId of ['status-badge', 'requested-priority-badge']) {
      const badge = await screen.findByTestId(testId)
      expect(badge.querySelector('i.bi[aria-hidden="true"]')).toBeTruthy()
      expect(badge.textContent?.trim()).not.toBe('')
    }
  })
})

describe('UI-49: obsolete Lab 2 badge name removed (ui-spec.md §11)', () => {
  it('Waiting for Requester uses the renamed waiting badge style', async () => {
    stubApi(testStaffUser, staffReads(staffDetail({ currentStatus: 'WAITING_FOR_REQUESTER' })))
    renderAt('/staff/tickets/101')
    const badge = await screen.findByTestId('status-badge')
    expect(badge.className).toContain('zg-badge-status-waiting')
  })
})
