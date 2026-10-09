import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testAdminUser, testStaffUser, testUser } from '../helpers/auth'
import type {
  AuthUser,
  StaffTicketDetail,
  StatusHistoryEntry,
  TicketDetail,
  TicketStatus,
  TicketWorkflowState,
} from '../../src/types'

// UI-24..UI-31 (AC-19, AC-20, AC-23, AC-26, AC-27): docs/lab-04 ui-spec.md
// §2.2, §5.1, §5.3, §6 — the Ticket Detail status controls, the resolution
// gate callout, conflict feedback, Status History, and the Requester's
// advisory "Problem Appears Resolved" action.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
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

function workflowState(overrides: Partial<TicketWorkflowState> = {}): TicketWorkflowState {
  return {
    id: 101,
    version: 4,
    currentStatus: 'IN_PROGRESS',
    resolvedAt: null,
    ownerId: null,
    ownerName: null,
    itPriority: 'MEDIUM',
    updatedAt: '2026-10-06T07:05:00.000Z',
    ...overrides,
  }
}

function entry(
  id: number,
  fromStatus: TicketStatus | null,
  toStatus: TicketStatus,
  changedAt = '2026-10-06T07:05:00.000Z',
): StatusHistoryEntry {
  return {
    id,
    fromStatus,
    toStatus,
    changedBy: { id: 12, name: 'Sarah Johnson', role: 'IT_STAFF' },
    changedAt,
  }
}

type Reply = { status: number; body: unknown } | Promise<{ status: number; body: unknown }>

function mockStaffApi(
  user: AuthUser,
  options: {
    details?: StaffTicketDetail[]
    histories?: StatusHistoryEntry[][]
    itStaff?: { id: number; name: string; role: AuthUser['role'] }[]
    onPatch?: (path: string, body: Record<string, unknown>) => Reply
  } = {},
) {
  const { details = [staffDetail()], histories = [[]], itStaff = [], onPatch } = options
  let detailCalls = 0
  let historyCalls = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return jsonResponse(user)
    if (url === '/api/staff/it-staff-users') return jsonResponse(itStaff)
    if (url === '/api/staff/tickets/101' && !init?.method) {
      return jsonResponse(details[Math.min(detailCalls++, details.length - 1)])
    }
    if (url === '/api/staff/tickets/101/status-history') {
      return jsonResponse({ data: histories[Math.min(historyCalls++, histories.length - 1)] })
    }
    if (url.startsWith('/api/staff/tickets/101/') && init?.method === 'PATCH' && onPatch) {
      const reply = await onPatch(
        url.replace('/api/staff/tickets/101/', ''),
        JSON.parse(init.body as string),
      )
      return jsonResponse(reply.body, reply.status)
    }
    return Promise.reject(new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`))
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

const statusSelect = async () =>
  (await screen.findByLabelText(/current status/i)) as HTMLSelectElement

const optionValues = (select: HTMLSelectElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-24 (AC-27, BR-16): only permitted transitions are offered', () => {
  // specification.md BR-16, written out independently of the client mirror.
  const MATRIX: Record<TicketStatus, TicketStatus[]> = {
    NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
    OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
    IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
    RESOLVED: ['CLOSED', 'REOPENED'],
    CLOSED: ['REOPENED'],
    REOPENED: ['OPEN', 'IN_PROGRESS'],
    CANCELLED: [],
  }

  it.each(Object.entries(MATRIX))('from %s', async (from, to) => {
    mockStaffApi(testStaffUser, {
      details: [staffDetail({ currentStatus: from as TicketStatus })],
    })
    renderAt('/staff/tickets/101')
    const select = await statusSelect()
    expect(optionValues(select).sort()).toEqual([from, ...to].sort())
    expect(select.value).toBe(from)
  })
})

describe('UI-25 (AC-27, BR-18): gate failing', () => {
  it('shows "Resolved (blocked)" disabled with each reason linked to #actions-taken', async () => {
    mockStaffApi(testStaffUser, {
      details: [
        staffDetail({
          resolutionGate: { canResolve: false, reasons: ['NO_DONE_ACTION', 'PENDING_FOLLOW_UPS'] },
        }),
      ],
    })
    renderAt('/staff/tickets/101')
    const select = await statusSelect()

    const blocked = within(select).getByRole('option', {
      name: 'Resolved (blocked)',
    }) as HTMLOptionElement
    expect(blocked.disabled).toBe(true)

    const callout = screen.getByTestId('resolution-gate-callout')
    expect(select.getAttribute('aria-describedby')).toBe(callout.id)
    const links = within(callout).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      'Record at least one action as Done.',
      'Clear every pending follow-up.',
    ])
    expect(links.every((l) => l.getAttribute('href') === '#actions-taken')).toBe(true)
  })

  it('shows no callout and an enabled Resolved option when the gate passes', async () => {
    mockStaffApi(testStaffUser)
    renderAt('/staff/tickets/101')
    const select = await statusSelect()
    const resolved = within(select).getByRole('option', { name: 'Resolved' }) as HTMLOptionElement
    expect(resolved.disabled).toBe(false)
    expect(screen.queryByTestId('resolution-gate-callout')).toBeNull()
  })
})

describe('UI-26 (AC-19, AC-27): successful change', () => {
  it('sends version, then updates the badge and Status History without a reload', async () => {
    const fetchMock = mockStaffApi(testStaffUser, {
      histories: [
        [entry(1, null, 'NEW'), entry(2, 'NEW', 'IN_PROGRESS')],
        [
          entry(1, null, 'NEW'),
          entry(2, 'NEW', 'IN_PROGRESS'),
          entry(3, 'IN_PROGRESS', 'RESOLVED'),
        ],
      ],
      onPatch: (path, body) => {
        if (path === 'status') {
          return {
            status: 200,
            body: workflowState({ version: 4, currentStatus: body.status as TicketStatus }),
          }
        }
        // The next write must carry the version the status change returned.
        if (path === 'priority' && body.version === 4) {
          return { status: 200, body: workflowState({ version: 5, currentStatus: 'RESOLVED' }) }
        }
        return { status: 500, body: { error: { code: 'X', message: 'Wrong version sent.' } } }
      },
    })
    renderAt('/staff/tickets/101')
    const select = await statusSelect()
    expect(screen.getByTestId('status-badge').textContent).toBe('In Progress')

    await userEvent.selectOptions(select, 'RESOLVED')

    await waitFor(() => expect(screen.getByTestId('status-badge').textContent).toBe('Resolved'))
    expect(select.value).toBe('RESOLVED')
    expect(optionValues(select).sort()).toEqual(['CLOSED', 'REOPENED', 'RESOLVED'])
    const history = await screen.findByTestId('status-history')
    await waitFor(() => expect(within(history).getAllByRole('listitem')).toHaveLength(3))
    expect(screen.getByTestId('workflow-announcement').textContent).toBe(
      'Status changed to Resolved.',
    )

    const statusCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/status'))!
    expect(JSON.parse(statusCall[1]!.body as string)).toEqual({ status: 'RESOLVED', version: 3 })

    await userEvent.selectOptions(screen.getByLabelText(/it priority/i), 'HIGH')
    await waitFor(() =>
      expect(screen.getByTestId('workflow-announcement').textContent).toMatch(/IT Priority/),
    )
  })

  it('disables every workflow control while a change is in flight (no double submit)', async () => {
    let release: (reply: { status: number; body: unknown }) => void = () => {}
    const fetchMock = mockStaffApi(testStaffUser, {
      onPatch: () =>
        new Promise((resolve) => {
          release = resolve
        }),
    })
    renderAt('/staff/tickets/101')
    const select = await statusSelect()

    await userEvent.selectOptions(select, 'WAITING_FOR_REQUESTER')
    expect(select.disabled).toBe(true)
    expect((screen.getByLabelText(/it priority/i) as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText(/ticket owner/i) as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText('Saving status…')).toBeTruthy()

    release({ status: 200, body: workflowState({ currentStatus: 'WAITING_FOR_REQUESTER' }) })
    await waitFor(() => expect(select.disabled).toBe(false))
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/status'))).toHaveLength(1)
  })
})

describe('UI-27 (AC-16): server RESOLUTION_BLOCKED', () => {
  it('reverts the select and shows the backend message and callout from details.reasons', async () => {
    mockStaffApi(testStaffUser, {
      onPatch: () => ({
        status: 409,
        body: {
          error: {
            code: 'RESOLUTION_BLOCKED',
            message: "This ticket can't be resolved yet: it has open actions.",
            details: { reasons: ['OPEN_ACTIONS'] },
          },
        },
      }),
    })
    renderAt('/staff/tickets/101')
    const select = await statusSelect()

    await userEvent.selectOptions(select, 'RESOLVED')

    expect((await screen.findByRole('alert')).textContent).toBe(
      "This ticket can't be resolved yet: it has open actions.",
    )
    expect(select.value).toBe('IN_PROGRESS')
    const callout = screen.getByTestId('resolution-gate-callout')
    expect(within(callout).getByRole('link').textContent).toBe(
      'Finish or cancel every Planned or In Progress action.',
    )
    const blocked = within(select).getByRole('option', {
      name: 'Resolved (blocked)',
    }) as HTMLOptionElement
    expect(blocked.disabled).toBe(true)
  })
})

describe('UI-28 (AC-23, BR-26): server STALE_UPDATE', () => {
  const stale = {
    status: 409,
    body: {
      error: {
        code: 'STALE_UPDATE',
        message: 'This ticket was changed by someone else. Reload to see the latest version.',
        field: 'version',
        details: {
          current: workflowState({
            currentStatus: 'WAITING_FOR_REQUESTER',
            ownerId: 30,
            ownerName: 'Ahmed Hassan',
            itPriority: 'HIGH',
          }),
        },
      },
    },
  }

  it.each([
    ['status', /current status/i, 'CANCELLED', 'IN_PROGRESS'],
    ['priority', /it priority/i, 'LOW', 'MEDIUM'],
    ['owner', /ticket owner/i, '12', ''],
  ])(
    '%s: reverts the control and shows the conflict banner with latest values',
    async (_p, label, pick, saved) => {
      mockStaffApi(testStaffUser, {
        itStaff: [{ id: 12, name: 'Sarah Johnson', role: 'IT_STAFF' }],
        onPatch: () => stale,
      })
      renderAt('/staff/tickets/101')
      const select = (await screen.findByLabelText(label)) as HTMLSelectElement
      await screen.findByRole('option', { name: 'Sarah Johnson' })

      await userEvent.selectOptions(select, pick)

      const banner = await screen.findByTestId('workflow-conflict')
      expect(banner.getAttribute('role')).toBe('alert')
      expect(banner.textContent).toContain(
        'Someone else changed this ticket while you were editing.',
      )
      expect(banner.textContent).toContain(
        'Latest values: status Waiting for Requester, owner Ahmed Hassan, IT Priority High.',
      )
      expect(select.value).toBe(saved)
    },
  )

  it('Reload latest refetches the Ticket and clears the banner', async () => {
    mockStaffApi(testStaffUser, {
      details: [
        staffDetail(),
        staffDetail({ currentStatus: 'WAITING_FOR_REQUESTER', version: 4, itPriority: 'HIGH' }),
      ],
      onPatch: () => stale,
    })
    renderAt('/staff/tickets/101')
    await userEvent.selectOptions(await statusSelect(), 'CANCELLED')
    await screen.findByTestId('workflow-conflict')

    await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }))

    await waitFor(() =>
      expect(screen.getByTestId('status-badge').textContent).toBe('Waiting for Requester'),
    )
    expect(screen.queryByTestId('workflow-conflict')).toBeNull()
    expect((screen.getByLabelText(/it priority/i) as HTMLSelectElement).value).toBe('HIGH')
  })
})

describe('UI-29 (FR-09, BR-22): Status History', () => {
  it('lists entries oldest first with badges, name, role, and Bangkok time', async () => {
    mockStaffApi(testStaffUser, {
      histories: [
        [entry(1, null, 'NEW'), entry(2, 'NEW', 'IN_PROGRESS', '2026-10-06T16:59:00.000Z')],
      ],
    })
    renderAt('/staff/tickets/101')

    const items = within(await screen.findByTestId('status-history')).getAllByRole('listitem')
    expect(items[0]!.textContent).toMatch(/^Created as New/)
    expect(items[1]!.textContent).toMatch(/^New→toIn Progress/)
    expect(items[1]!.textContent).toContain('Sarah Johnson')
    expect(items[1]!.textContent).toContain('IT Staff')
    // 16:59 UTC is 23:59 in Bangkok.
    const time = items[1]!.querySelector('time')!
    expect(time.getAttribute('dateTime')).toBe('2026-10-06T16:59:00.000Z')
    expect(time.textContent).toBe('6 Oct 2026, 23:59')
    expect(screen.queryByRole('button', { name: /edit|delete/i })).toBeNull()
  })

  it('says so for a legacy Ticket with no entries', async () => {
    mockStaffApi(testStaffUser)
    renderAt('/staff/tickets/101')
    expect(await screen.findByText('No status changes recorded yet.')).toBeTruthy()
  })

  it('shows the latest 10 with a Show all toggle beyond that', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      entry(i + 1, i === 0 ? null : 'OPEN', i === 0 ? 'NEW' : 'IN_PROGRESS'),
    )
    mockStaffApi(testStaffUser, { histories: [many] })
    renderAt('/staff/tickets/101')

    const list = await screen.findByTestId('status-history')
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    expect(within(list).queryByText(/Created as/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Show all (12)' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(12)
    expect(within(list).getAllByRole('listitem')[0]!.textContent).toMatch(/^Created as/)
  })
})

describe('UI-30 (AC-20, BR-20): the Requester indication stays advisory', () => {
  it('staff view shows the indication, but Resolved is still driven only by resolutionGate', async () => {
    mockStaffApi(testStaffUser, {
      details: [
        staffDetail({
          requesterConfirmedResolvedAt: '2026-10-06T03:00:00.000Z',
          resolutionGate: { canResolve: false, reasons: ['NO_DONE_ACTION'] },
        }),
      ],
    })
    renderAt('/staff/tickets/101')
    const select = await statusSelect()

    expect(screen.getByText(/requester confirms resolved/i).textContent).toContain(
      '6 Oct 2026, 10:00',
    )
    const blocked = within(select).getByRole('option', {
      name: 'Resolved (blocked)',
    }) as HTMLOptionElement
    expect(blocked.disabled).toBe(true)
  })
})

describe('UI-31 (AC-26, BR-29, BR-30): Administrator detail', () => {
  it('shows every workflow control and lists Administrators with a role suffix', async () => {
    mockStaffApi(testAdminUser, {
      itStaff: [
        { id: 21, name: 'Alex Morgan', role: 'ADMINISTRATOR' },
        { id: 12, name: 'Sarah Johnson', role: 'IT_STAFF' },
      ],
    })
    renderAt('/staff/tickets/101')

    expect(await statusSelect()).toBeTruthy()
    expect(screen.getByLabelText(/it priority/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Claim' })).toBeTruthy()
    const owner = screen.getByLabelText(/ticket owner/i)
    expect(
      await within(owner).findByRole('option', { name: 'Alex Morgan · Administrator' }),
    ).toBeTruthy()
    expect(within(owner).getByRole('option', { name: 'Sarah Johnson' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ticket Queue' })).toBeTruthy()
  })
})

describe('Requester Ticket Detail (BR-17, BR-20)', () => {
  const requesterDetail: TicketDetail = {
    id: 101,
    ticketNumber: 'TKT-2026-000101',
    requester: { id: 7, name: 'Priya Shah' },
    ownerName: 'Sarah Johnson',
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
  }

  function mockRequesterApi() {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/auth/me') return jsonResponse(testUser)
      if (url === '/api/tickets/101') return jsonResponse(requesterDetail)
      if (url === '/api/tickets/101/status-history') {
        return jsonResponse({ data: [entry(1, null, 'NEW'), entry(2, 'NEW', 'IN_PROGRESS')] })
      }
      if (url === '/api/tickets/101/resolved' && init?.method === 'PATCH') {
        return jsonResponse({ id: 101, requesterConfirmedResolvedAt: '2026-10-06T03:00:00.000Z' })
      }
      return Promise.reject(new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('has no staff status controls, and shows the read-only Status History', async () => {
    mockRequesterApi()
    renderAt('/tickets/101')
    await screen.findByText('TKT-2026-000101')

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /claim|reload latest/i })).toBeNull()
    expect(screen.queryByTestId('resolution-gate-callout')).toBeNull()
    const history = await screen.findByTestId('status-history')
    expect(within(history).getAllByRole('listitem')).toHaveLength(2)
  })

  it('labels "Problem Appears Resolved" as a request and never changes the status', async () => {
    const fetchMock = mockRequesterApi()
    renderAt('/tickets/101')

    const button = await screen.findByRole('button', { name: 'Problem Appears Resolved' })
    const hint = document.getElementById(button.getAttribute('aria-describedby')!)!
    expect(hint.textContent).toBe(
      'Lets IT Staff know it looks fixed. Only IT Staff can resolve the ticket.',
    )

    await userEvent.click(button)
    expect(screen.getByRole('dialog').textContent).toContain('it does not close the Ticket')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByTestId('resolved-badge')).toBeTruthy()
    expect(screen.getByTestId('status-badge').textContent).toBe('In Progress')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/staff/'))).toBe(false)
  })
})
