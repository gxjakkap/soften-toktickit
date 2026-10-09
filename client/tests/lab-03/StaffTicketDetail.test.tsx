import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testStaffUser, testUser } from '../helpers/auth'
import type { StaffTicketDetail } from '../../src/types'

// ui-spec.md §6, api-spec.md §4.2-4.7 (FR-13..19, BR-18..22, BR-29, BR-30):
// the IT Staff Ticket Detail screen — ownership/priority/status controls,
// Public Comments vs. Internal Notes separation, and every documented state.
//
// Lab 4 (docs/lab-04/tests.md §6, BR-24): stubbed details carry `version`,
// `resolvedAt`, and `resolutionGate`; a successful workflow PATCH answers
// with the full TicketWorkflowState; request bodies assert `version`; the
// new Status History read is stubbed empty.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function detail(overrides: Partial<StaffTicketDetail> = {}): StaffTicketDetail {
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
    currentStatus: 'NEW',
    requesterConfirmedResolvedAt: null,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    attachments: [],
    comments: [],
    version: 1,
    resolvedAt: null,
    resolutionGate: { canResolve: true, reasons: [] },
    ...overrides,
  }
}

function mockApi(
  user: typeof testUser,
  options: {
    ticket?: StaffTicketDetail | null
    ticketStatus?: number
    itStaff?: { id: number; name: string }[]
    onPatch?: (path: string, body: unknown) => { status: number; body: unknown } | undefined
    onPost?: (body: unknown) => { status: number; body: unknown } | undefined
  } = {},
) {
  const { ticket = detail(), ticketStatus = 200, itStaff = [], onPatch, onPost } = options

  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return jsonResponse(user)
    if (url === '/api/staff/it-staff-users') return jsonResponse(itStaff)
    if (url === '/api/staff/tickets/101' && (!init || init.method === undefined)) {
      if (!ticket) {
        const code = ticketStatus === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'
        return jsonResponse({ error: { code, message: 'Request failed.' } }, ticketStatus)
      }
      return jsonResponse(ticket, ticketStatus)
    }
    if (url === '/api/staff/tickets/101/status-history') return jsonResponse({ data: [] })
    if (url.startsWith('/api/staff/tickets/101/') && init?.method === 'PATCH') {
      const path = url.replace('/api/staff/tickets/101/', '')
      const body = init.body ? JSON.parse(init.body as string) : undefined
      const result = onPatch?.(path, body)
      if (result?.status === 200 && ticket) {
        const { id, currentStatus, resolvedAt, ownerId, ownerName, itPriority, updatedAt } = ticket
        const state = { id, currentStatus, resolvedAt, ownerId, ownerName, itPriority, updatedAt }
        return jsonResponse({ ...state, version: ticket.version + 1, ...(result.body as object) })
      }
      if (result) return jsonResponse(result.body, result.status)
      return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Unhandled.' } }, 500)
    }
    if (url === '/api/staff/tickets/101/comments' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string)
      const result = onPost?.(body)
      if (result) return jsonResponse(result.body, result.status)
      return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Unhandled.' } }, 500)
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets/101']}>
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

describe('Ticket Detail access', () => {
  it('shows the forbidden state for a Requester, with no detail request made', async () => {
    mockApi(testUser) // testUser is REQUESTER; a /api/staff/tickets/* call fails the test
    renderDetail()

    expect(await screen.findByTestId('detail-forbidden')).toBeTruthy()
    expect(screen.getByText(/you don.t have access to this page/i)).toBeTruthy()
  })
})

describe('Ticket Detail read-only info', () => {
  it('renders Ticket No., Requester, Requested Priority, and Description', async () => {
    mockApi(testStaffUser)
    renderDetail()

    expect(await screen.findByText('TKT-2026-000101')).toBeTruthy()
    expect(screen.getByText('Priya Shah')).toBeTruthy()
    expect(within(screen.getByTestId('requested-priority-badge')).getByText(/medium/i)).toBeTruthy()
    expect(screen.getByText(/battery drains much faster/i)).toBeTruthy()
  })

  it('shows the safe error state with retry on a load failure', async () => {
    mockApi(testStaffUser, { ticket: null, ticketStatus: 500 })
    renderDetail()

    expect(await screen.findByText(/unable to load this ticket/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })
})

describe('Ownership', () => {
  it('shows Claim on an unassigned Ticket and sets the caller as Owner on click', async () => {
    const fetchMock = mockApi(testStaffUser, {
      ticket: detail({ ownerId: null, ownerName: null }),
      onPatch: (path) => {
        if (path === 'claim') {
          return {
            status: 200,
            body: { id: 101, ownerId: testStaffUser.id, ownerName: testStaffUser.name },
          }
        }
        return undefined
      },
    })
    renderDetail()

    const claimButton = await screen.findByRole('button', { name: /claim/i })
    await userEvent.click(claimButton)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]: [string, RequestInit?]) =>
            url === '/api/staff/tickets/101/claim' &&
            init?.method === 'PATCH' &&
            JSON.parse(init.body as string).version === 1,
        ),
      ).toBe(true)
    })
  })

  it('hides Claim once owned by someone else, and Reassign changes the Owner select', async () => {
    mockApi(testStaffUser, {
      ticket: detail({ ownerId: 99, ownerName: 'Someone Else' }),
      itStaff: [
        { id: 99, name: 'Someone Else' },
        { id: testStaffUser.id, name: testStaffUser.name },
      ],
      onPatch: (path, body) => {
        if (path === 'owner') {
          const target = (body as { ownerId: number | null }).ownerId
          return {
            status: 200,
            body: {
              id: 101,
              ownerId: target,
              ownerName: target === testStaffUser.id ? testStaffUser.name : null,
            },
          }
        }
        return undefined
      },
    })
    renderDetail()

    await screen.findByText('TKT-2026-000101')
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull()

    const ownerSelect = screen.getByLabelText(/ticket owner/i) as HTMLSelectElement
    await userEvent.selectOptions(ownerSelect, String(testStaffUser.id))

    await waitFor(() => expect(ownerSelect.value).toBe(String(testStaffUser.id)))
  })
})

describe('IT Priority and Status', () => {
  it('submits an IT Priority change', async () => {
    const fetchMock = mockApi(testStaffUser, {
      ticket: detail({ itPriority: 'LOW' }),
      onPatch: (path, body) => {
        if (path === 'priority') return { status: 200, body: { id: 101, ...(body as object) } }
        return undefined
      },
    })
    renderDetail()

    const prioritySelect = await screen.findByLabelText(/it priority/i)
    await userEvent.selectOptions(prioritySelect, 'HIGH')

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]: [string, RequestInit?]) =>
            url === '/api/staff/tickets/101/priority' &&
            init?.method === 'PATCH' &&
            JSON.parse(init.body as string).version === 1,
        ),
      ).toBe(true)
    })
  })

  it('only offers permitted transitions from the current status (specification.md §7)', async () => {
    mockApi(testStaffUser, { ticket: detail({ currentStatus: 'RESOLVED' }) })
    renderDetail()

    const statusSelect = (await screen.findByLabelText(/current status/i)) as HTMLSelectElement
    const options = within(statusSelect)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)

    // Resolved -> Closed or Reopened only (specification.md §7's matrix).
    expect(options.sort()).toEqual(['CLOSED', 'REOPENED', 'RESOLVED'].sort())
  })

  it('reverts the Status select and shows an error on a 409 INVALID_TRANSITION', async () => {
    mockApi(testStaffUser, {
      ticket: detail({ currentStatus: 'NEW' }),
      onPatch: (path) => {
        if (path === 'status') {
          return {
            status: 409,
            body: {
              error: {
                code: 'INVALID_TRANSITION',
                message: 'This status change is not permitted.',
              },
            },
          }
        }
        return undefined
      },
    })
    renderDetail()

    const statusSelect = (await screen.findByLabelText(/current status/i)) as HTMLSelectElement
    await userEvent.selectOptions(statusSelect, 'OPEN')

    expect(await screen.findByText(/not permitted/i)).toBeTruthy()
    await waitFor(() => expect(statusSelect.value).toBe('NEW'))
  })
})

describe('Public Comments vs. Internal Notes', () => {
  it('renders both in visually distinct sections and posts into the correct one', async () => {
    const fetchMock = mockApi(testStaffUser, {
      ticket: detail({
        comments: [
          {
            id: 1,
            authorName: 'Priya Shah',
            authorRole: 'REQUESTER',
            visibility: 'PUBLIC',
            content: 'Still broken.',
            createdAt: '2026-01-01T10:00:00.000Z',
          },
        ],
      }),
      onPost: (body) => {
        const b = body as { visibility: string; content: string }
        return {
          status: 201,
          body: {
            id: 2,
            ticketId: 101,
            authorName: testStaffUser.name,
            authorRole: 'IT_STAFF',
            visibility: b.visibility,
            content: b.content,
            createdAt: '2026-01-01T11:00:00.000Z',
          },
        }
      },
    })
    renderDetail()

    await screen.findByText('Still broken.')
    const internalSection = screen.getByTestId('internal-notes-section')
    expect(within(internalSection).getByText(/internal only/i)).toBeTruthy()
    expect(within(internalSection).queryByText('Still broken.')).toBeNull()

    const noteBox = within(internalSection).getByLabelText(/add an internal note/i)
    await userEvent.type(noteBox, 'Escalated to vendor.')
    await userEvent.click(
      within(internalSection).getByRole('button', { name: /post internal note/i }),
    )

    await waitFor(() =>
      expect(within(internalSection).getByText('Escalated to vendor.')).toBeTruthy(),
    )
    expect(
      fetchMock.mock.calls.some(([url, init]: [string, RequestInit?]) => {
        if (url !== '/api/staff/tickets/101/comments' || init?.method !== 'POST') return false
        const body = JSON.parse(init.body as string)
        return body.visibility === 'INTERNAL'
      }),
    ).toBe(true)
  })
})
