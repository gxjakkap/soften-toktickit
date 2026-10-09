import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { fromBangkokInput } from '../../src/lib/datetime'
import { testStaffUser, testUser } from '../helpers/auth'
import type { ActionTaken, StaffTicketDetail, TicketDetail } from '../../src/types'

// UI-11..UI-23 (AC-01, AC-04, AC-05, AC-07..AC-09, AC-11, AC-12, AC-27,
// AC-42, AC-44): docs/lab-04 ui-spec.md §2.2, §2.3, §5.2, §6, §9 — the
// Actions Taken section on both Ticket Detail screens.

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

const sarah = { id: 12, name: 'Sarah Johnson', role: 'IT_STAFF' as const }
const ahmed = { id: 14, name: 'Ahmed Hassan', role: 'IT_STAFF' as const }
const alex = { id: 21, name: 'Alex Morgan', role: 'ADMINISTRATOR' as const }

function action(overrides: Partial<ActionTaken> = {}): ActionTaken {
  return {
    id: 5001,
    ticketId: 101,
    actionAt: '2026-10-06T03:30:00.000Z',
    description: 'Ran the battery diagnostic.',
    result: null,
    status: 'PLANNED',
    performedBy: sarah,
    assignedTo: { ...sarah, isActive: true },
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    version: 1,
    createdAt: '2026-10-06T03:31:00.000Z',
    updatedAt: '2026-10-06T03:31:00.000Z',
    ...overrides,
  }
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
    resolutionGate: { canResolve: false, reasons: ['NO_DONE_ACTION'] },
    ...overrides,
  }
}

type Reply = { status: number; body: unknown }

function mockStaffApi(
  options: {
    actions?: ActionTaken[][]
    details?: StaffTicketDetail[]
    onPost?: (body: Record<string, unknown>) => Reply | Promise<Reply>
    onPatch?: (path: string, body: Record<string, unknown>) => Reply | Promise<Reply>
  } = {},
) {
  const { actions = [[]], details = [staffDetail()], onPost, onPatch } = options
  let actionCalls = 0
  let detailCalls = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return jsonResponse(testStaffUser)
    if (url === '/api/staff/it-staff-users') return jsonResponse([alex, ahmed, sarah])
    if (url === '/api/staff/tickets/101') {
      return jsonResponse(details[Math.min(detailCalls++, details.length - 1)])
    }
    if (url === '/api/staff/tickets/101/status-history') return jsonResponse({ data: [] })
    if (url === '/api/staff/tickets/101/actions' && !init?.method) {
      return jsonResponse({ data: actions[Math.min(actionCalls++, actions.length - 1)] })
    }
    if (url === '/api/staff/tickets/101/actions' && init?.method === 'POST' && onPost) {
      const reply = await onPost(JSON.parse(init.body as string))
      return jsonResponse(reply.body, reply.status)
    }
    if (url.startsWith('/api/staff/tickets/101/actions/') && init?.method === 'PATCH' && onPatch) {
      const reply = await onPatch(url, JSON.parse(init.body as string))
      return jsonResponse(reply.body, reply.status)
    }
    return Promise.reject(new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const callsTo = (fetchMock: ReturnType<typeof mockStaffApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method)

const bodyOf = (fetchMock: ReturnType<typeof mockStaffApi>, method: string, n = 0) =>
  JSON.parse(callsTo(fetchMock, method)[n]![1]!.body as string)

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const section = async () => {
  await screen.findByRole('heading', { name: /^Actions Taken \(\d+\)$/ })
  return within(document.getElementById('actions-taken')!)
}

const rows = () => screen.getAllByTestId('action-row')

async function openCreate() {
  const user = userEvent.setup()
  renderAt('/staff/tickets/101')
  const area = await section()
  await user.click(area.getByRole('button', { name: 'Add Action' }))
  return { user, area }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-11 (FR-02, BR-13): list mode', () => {
  it('shows every column in server order, with non-color cues for Cancelled and Inactive', async () => {
    mockStaffApi({
      actions: [
        [
          action({ id: 3, description: 'Second by time', actionAt: '2026-10-06T05:00:00.000Z' }),
          action({
            id: 1,
            description: 'Third, same time, higher id',
            actionAt: '2026-10-06T05:00:00.000Z',
            status: 'CANCELLED',
          }),
          action({
            id: 2,
            description: 'Replaced the battery.',
            actionAt: '2026-10-06T03:30:00.000Z',
            status: 'DONE',
            result: 'Holds charge for 6 hours.',
            performedBy: ahmed,
            assignedTo: { id: 30, name: 'Linda Park', role: 'IT_STAFF', isActive: false },
            followUpRequired: true,
            followUpNote: 'Check again next week.',
            attachmentNotes: 'battery-diagnostic.pdf',
          }),
        ],
      ],
    })
    renderAt('/staff/tickets/101')
    const area = await section()

    expect(area.getByRole('heading', { name: 'Actions Taken (3)' })).toBeTruthy()
    const headers = area.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      'Date/Time',
      'Description',
      'Result',
      'Performed By',
      'Assigned To',
      'Status',
      'Follow-Up',
      'Edit',
    ])

    // Rows keep the server's order; the client never re-sorts them.
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Second by time'),
      expect.stringContaining('Third, same time'),
      expect.stringContaining('Replaced the battery.'),
    ])

    const done = within(rows()[2]!)
    // BR-33: Bangkok time, wrapped in <time> with the exact instant.
    expect(done.getByText('6 Oct 2026, 10:30').getAttribute('datetime')).toBe(
      '2026-10-06T03:30:00.000Z',
    )
    expect(done.getByText('Holds charge for 6 hours.')).toBeTruthy()
    expect(done.getByText('Ahmed Hassan')).toBeTruthy()
    expect(done.getByText('Linda Park')).toBeTruthy()
    expect(done.getByText('Inactive')).toBeTruthy()
    expect(done.getByText('Done')).toBeTruthy()
    expect(done.getByText('Follow-up')).toBeTruthy()
    expect(done.getByText('Check again next week.')).toBeTruthy()
    expect(done.getByText(/Files: battery-diagnostic\.pdf/)).toBeTruthy()
    expect(done.getByRole('button', { name: /^Edit follow-up/ })).toBeTruthy()

    const cancelled = rows()[1]!
    expect(cancelled.className).toContain('is-cancelled')
    expect(within(cancelled).getByText('Cancelled')).toBeTruthy()
    expect(within(cancelled).queryByRole('button')).toBeNull()
  })

  it('shows the empty state with Add Action', async () => {
    mockStaffApi()
    renderAt('/staff/tickets/101')
    const area = await section()
    expect(area.getByText('No actions recorded yet.')).toBeTruthy()
    expect(area.getByRole('button', { name: 'Add Action' })).toBeTruthy()
  })

  it('shows a scoped error with Retry when the list fails', async () => {
    let fail = true
    const base = mockStaffApi()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/staff/tickets/101/actions' && fail) {
          fail = false
          return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, 500)
        }
        return base(url, init)
      }),
    )
    const user = userEvent.setup()
    renderAt('/staff/tickets/101')
    expect(await screen.findByText('Unable to load the actions taken.')).toBeTruthy()
    // The rest of the screen still renders.
    expect(screen.getByLabelText(/current status/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No actions recorded yet.')).toBeTruthy()
  })
})

describe('UI-12 (AC-01, FR-01, AC-27): create', () => {
  it('posts the form with a clientRequestId, shows the row, and refreshes the resolution gate', async () => {
    const created = action({ id: 6001, description: 'Swapped the charger.', status: 'DONE' })
    const fetchMock = mockStaffApi({
      details: [
        staffDetail(),
        staffDetail({ version: 3, resolutionGate: { canResolve: true, reasons: [] } }),
      ],
      onPost: () => ({ status: 201, body: created }),
    })
    const { user, area } = await openCreate()

    // Focus moves to the panel heading; defaults are now, Planned, and me.
    const heading = area.getByRole('heading', { name: 'New Action' })
    expect(document.activeElement).toBe(heading)
    const actionAt = area.getByLabelText(/action date\/time/i) as HTMLInputElement
    expect(actionAt.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(Math.abs(Date.parse(fromBangkokInput(actionAt.value)) - Date.now())).toBeLessThan(
      2 * 60 * 1000,
    )
    expect((area.getByLabelText(/^status/i) as HTMLSelectElement).value).toBe('PLANNED')
    const assignee = area.getByLabelText(/assigned to/i) as HTMLSelectElement
    expect(assignee.value).toBe('12')
    expect(assignee.selectedOptions[0]!.textContent).toBe('Sarah Johnson (me)')
    expect(
      within(assignee).getByRole('option', { name: 'Alex Morgan · Administrator' }),
    ).toBeTruthy()
    // BR-03: Performed By is text, not an input.
    expect(area.getByText(/Performed by:/).parentElement!.textContent).toContain('Sarah Johnson')
    expect(area.getByText(/Requesters can see every field of an action/)).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Resolved (blocked)' })).toBeTruthy()

    await user.clear(actionAt)
    await user.type(actionAt, '2026-10-06T14:05')
    await user.type(area.getByLabelText(/action description/i), '  Swapped the charger.  ')
    await user.selectOptions(area.getByLabelText(/^status/i), 'DONE')
    await user.type(area.getByLabelText(/^result/i), 'Charging normally.')
    await user.selectOptions(assignee, '14')
    await user.type(area.getByLabelText(/attachment notes/i), 'charger-photo.jpg')
    await user.click(area.getByRole('button', { name: 'Save Action' }))

    expect(await screen.findByText('Swapped the charger.')).toBeTruthy()
    const body = bodyOf(fetchMock, 'POST')
    expect(body).toEqual({
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      actionAt: '2026-10-06T14:05:00+07:00',
      description: 'Swapped the charger.',
      result: 'Charging normally.',
      status: 'DONE',
      assignedToId: 14,
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: 'charger-photo.jpg',
    })
    expect(body).not.toHaveProperty('performedById')

    expect(area.queryByRole('heading', { name: 'New Action' })).toBeNull()
    expect(area.getByRole('heading', { name: 'Actions Taken (1)' })).toBeTruthy()
    expect(screen.getByTestId('workflow-announcement').textContent).toBe('Action added.')
    await waitFor(() =>
      expect(document.activeElement).toBe(area.getByRole('button', { name: 'Add Action' })),
    )
    // The Ticket is refetched, so Resolved stops being blocked without a reload.
    expect(await screen.findByRole('option', { name: 'Resolved' })).toBeTruthy()
    expect(screen.queryByTestId('resolution-gate-callout')).toBeNull()
  })
})

describe('UI-13 (AC-04, BR-06): follow-up note', () => {
  it('appears and becomes required only while Follow-Up Required is checked', async () => {
    const fetchMock = mockStaffApi()
    const { user, area } = await openCreate()

    expect(area.queryByLabelText(/follow-up note/i)).toBeNull()
    const checkbox = area.getByRole('checkbox', { name: 'Follow-Up Required?' })
    await user.click(checkbox)
    const note = area.getByLabelText(/follow-up note/i)
    expect(checkbox.getAttribute('aria-controls')).toBe(note.id)
    expect(note.getAttribute('aria-required')).toBe('true')
    expect(note.closest('div')!.querySelector('.zg-required')).toBeTruthy()

    await user.type(area.getByLabelText(/action description/i), 'Called the vendor.')
    await user.type(note, '   ')
    await user.click(area.getByRole('button', { name: 'Save Action' }))

    expect(area.getByText('Enter a follow-up note, or clear Follow-Up Required.')).toBeTruthy()
    expect(note.getAttribute('aria-invalid')).toBe('true')
    expect(note.getAttribute('aria-describedby')).toContain(`${note.id}-error`)
    expect(document.activeElement).toBe(note)
    expect(callsTo(fetchMock, 'POST')).toHaveLength(0)

    await user.click(checkbox)
    expect(area.queryByLabelText(/follow-up note/i)).toBeNull()
  })
})

describe('UI-14 (AC-09, BR-08): Result required for Done', () => {
  it('marks Result required for Done and blocks an empty one', async () => {
    const fetchMock = mockStaffApi()
    const { user, area } = await openCreate()

    expect(area.getByLabelText(/^result/i).getAttribute('aria-required')).toBe('false')
    await user.selectOptions(area.getByLabelText(/^status/i), 'DONE')
    expect(area.getByLabelText(/^result/i).getAttribute('aria-required')).toBe('true')
    await user.type(area.getByLabelText(/action description/i), 'Replaced the cable.')
    await user.click(area.getByRole('button', { name: 'Save Action' }))

    expect(area.getByText('Enter the result before marking the action Done.')).toBeTruthy()
    expect(callsTo(fetchMock, 'POST')).toHaveLength(0)
  })
})

describe('UI-15 (AC-05): server field errors', () => {
  it('shows INVALID_ASSIGNEE under Assigned To and keeps the input', async () => {
    mockStaffApi({
      onPost: () => ({
        status: 400,
        body: {
          error: {
            code: 'INVALID_ASSIGNEE',
            message: 'Assigned To must be an active IT Staff user or Administrator.',
            field: 'assignedToId',
          },
        },
      }),
    })
    const { user, area } = await openCreate()
    await user.type(area.getByLabelText(/action description/i), 'Reimage the laptop.')
    await user.selectOptions(area.getByLabelText(/assigned to/i), '14')
    await user.click(area.getByRole('button', { name: 'Save Action' }))

    const error = await area.findByText(
      'Assigned To must be an active IT Staff user or Administrator.',
    )
    const select = area.getByLabelText(/assigned to/i) as HTMLSelectElement
    expect(select.getAttribute('aria-describedby')).toBe(error.id)
    expect(select.value).toBe('14')
    expect((area.getByLabelText(/action description/i) as HTMLTextAreaElement).value).toBe(
      'Reimage the laptop.',
    )
  })

  it('maps a VALIDATION_ERROR field onto that input', async () => {
    mockStaffApi({
      onPost: () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Action date/time cannot be before the Ticket was created.',
            field: 'actionAt',
          },
        },
      }),
    })
    const { user, area } = await openCreate()
    await user.type(area.getByLabelText(/action description/i), 'Backdated entry.')
    await user.click(area.getByRole('button', { name: 'Save Action' }))

    const input = area.getByLabelText(/action date\/time/i)
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'))
    expect(area.getByText('Action date/time cannot be before the Ticket was created.')).toBeTruthy()
  })
})

describe('UI-16 (BR-09, AC-11, BR-25): edit a Done Action', () => {
  it('locks the finished fields and sends the version with only the changes', async () => {
    const done = action({
      status: 'DONE',
      result: 'Battery replaced.',
      followUpRequired: true,
      followUpNote: 'Confirm with the requester.',
      version: 4,
    })
    const fetchMock = mockStaffApi({
      actions: [[done]],
      onPatch: (_path, body) => ({
        status: 200,
        body: { ...done, followUpRequired: false, followUpNote: null, version: 5, ...body },
      }),
    })
    const user = userEvent.setup()
    renderAt('/staff/tickets/101')
    const area = await section()
    await user.click(area.getByRole('button', { name: /^Edit follow-up/ }))

    expect(document.activeElement).toBe(area.getByRole('heading', { name: 'Edit Action' }))
    expect(area.getByText(/Done actions keep their date, description/)).toBeTruthy()
    expect(area.getByTestId('action-5001-description-readonly').textContent).toBe(
      'Ran the battery diagnostic.',
    )
    expect(area.getByTestId('action-5001-result-readonly').textContent).toBe('Battery replaced.')
    expect(area.queryByRole('textbox', { name: /action description/i })).toBeNull()
    expect(area.queryByRole('combobox', { name: /^status/i })).toBeNull()

    await user.click(area.getByRole('checkbox', { name: 'Follow-Up Required?' }))
    await user.click(area.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH')).toHaveLength(1))
    expect(callsTo(fetchMock, 'PATCH')[0]![0]).toBe('/api/staff/tickets/101/actions/5001')
    expect(bodyOf(fetchMock, 'PATCH')).toEqual({
      version: 4,
      followUpRequired: false,
      followUpNote: null,
    })
    expect(await screen.findByText('Action updated.')).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(area.getByRole('button', { name: /^Edit follow-up/ })),
    )
  })
})

describe('UI-17 (BR-07): edit status options', () => {
  it('offers only permitted next statuses and confirms Cancelled inline', async () => {
    const inProgress = action({ status: 'IN_PROGRESS', version: 2 })
    const fetchMock = mockStaffApi({
      actions: [[inProgress]],
      onPatch: () => ({
        status: 200,
        body: { ...inProgress, status: 'CANCELLED', version: 3 },
      }),
    })
    const user = userEvent.setup()
    renderAt('/staff/tickets/101')
    const area = await section()
    await user.click(area.getByRole('button', { name: /^Edit:/ }))

    const status = area.getByLabelText(/^status/i) as HTMLSelectElement
    expect(
      within(status)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['In Progress', 'Planned', 'Done', 'Cancelled'])

    await user.selectOptions(status, 'CANCELLED')
    await user.click(area.getByRole('button', { name: 'Save Changes' }))
    expect(
      area.getByText("Cancel this action? It will stay visible but can't be edited."),
    ).toBeTruthy()
    expect(callsTo(fetchMock, 'PATCH')).toHaveLength(0)

    await user.click(area.getByRole('button', { name: 'Cancel action' }))
    await waitFor(() => expect(callsTo(fetchMock, 'PATCH')).toHaveLength(1))
    expect(bodyOf(fetchMock, 'PATCH')).toEqual({ version: 2, status: 'CANCELLED' })
    // The cancelled row loses its Edit button; its "Locked" text takes focus.
    await waitFor(() => expect(document.activeElement!.textContent).toBe('Locked'))
    expect(rows()[0]!.className).toContain('is-cancelled')
  })
})

describe('UI-18 (AC-08, AC-44, BR-26): stale update', () => {
  it('shows the latest values, keeps the typed input, and reloads only on request', async () => {
    const stored = action({ version: 2 })
    const newer = action({
      version: 3,
      status: 'IN_PROGRESS',
      description: 'Changed by Ahmed.',
      assignedTo: { ...ahmed, isActive: true },
      updatedAt: '2026-10-06T08:00:00.000Z',
    })
    mockStaffApi({
      actions: [[stored], [newer]],
      onPatch: () => ({
        status: 409,
        body: {
          error: {
            code: 'STALE_UPDATE',
            message: 'This action was changed by someone else.',
            field: 'version',
            details: { current: newer },
          },
        },
      }),
    })
    const user = userEvent.setup()
    renderAt('/staff/tickets/101')
    const area = await section()
    await user.click(area.getByRole('button', { name: /^Edit:/ }))
    const description = area.getByLabelText(/action description/i) as HTMLTextAreaElement
    await user.clear(description)
    await user.type(description, 'My unsaved wording.')
    await user.click(area.getByRole('button', { name: 'Save Changes' }))

    const banner = await area.findByTestId('action-conflict')
    expect(banner.textContent).toContain('Someone else changed this action while you were editing.')
    expect(banner.textContent).toContain('status In Progress, assignee Ahmed Hassan')
    expect(banner.textContent).toContain('6 Oct 2026, 15:00')
    expect(description.value).toBe('My unsaved wording.')

    await user.click(within(banner).getByRole('button', { name: 'Reload latest' }))
    await waitFor(() =>
      expect((area.getByLabelText(/action description/i) as HTMLTextAreaElement).value).toBe(
        'Changed by Ahmed.',
      ),
    )
    expect(area.queryByTestId('action-conflict')).toBeNull()
    expect((area.getByLabelText(/^status/i) as HTMLSelectElement).value).toBe('IN_PROGRESS')
  })
})

describe('UI-19 (AC-44, FR-20): server or network failure', () => {
  it('shows a safe banner and keeps every entered value after a 500', async () => {
    mockStaffApi({
      onPost: () => ({
        status: 500,
        body: {
          error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
        },
      }),
    })
    const { user, area } = await openCreate()
    await user.type(area.getByLabelText(/action description/i), 'Checked the dock.')
    await user.click(area.getByRole('checkbox', { name: 'Follow-Up Required?' }))
    await user.type(area.getByLabelText(/follow-up note/i), 'Order a new dock.')
    await user.click(area.getByRole('button', { name: 'Save Action' }))

    expect((await area.findByTestId('action-form-error')).textContent).toBe(
      'Something went wrong. Please try again.',
    )
    expect((area.getByLabelText(/action description/i) as HTMLTextAreaElement).value).toBe(
      'Checked the dock.',
    )
    expect((area.getByLabelText(/follow-up note/i) as HTMLTextAreaElement).value).toBe(
      'Order a new dock.',
    )
    expect(area.getByRole('heading', { name: 'New Action' })).toBeTruthy()
  })
})

describe('UI-19 (AC-44, AC-41): layout switch while editing', () => {
  it('keeps the edit form and its input when the viewport crosses 768px', async () => {
    // A controllable stand-in for the (max-width: 767px) media query.
    let mobile = false
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return mobile
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }))
    const resize = (next: boolean) =>
      act(() => {
        mobile = next
        listeners.forEach((fn) => fn())
      })

    mockStaffApi({ actions: [[action(), action({ id: 5002, description: 'Other action.' })]] })
    const user = userEvent.setup()
    renderAt('/staff/tickets/101')
    const area = await section()
    await user.click(area.getAllByRole('button', { name: /^Edit:/ })[0]!)
    const description = area.getByLabelText(/action description/i) as HTMLTextAreaElement
    await user.clear(description)
    await user.type(description, 'Typed before rotating.')
    expect(description.closest('td')).toBeTruthy()

    resize(true)
    const onMobile = area.getByLabelText(/action description/i) as HTMLTextAreaElement
    expect(area.queryByRole('table')).toBeNull()
    expect(onMobile.closest('.zg-ticket-cards')).toBeTruthy()
    // The same element moved; it was not remounted with fresh values.
    expect(onMobile).toBe(description)
    expect(onMobile.value).toBe('Typed before rotating.')

    resize(false)
    expect(area.getByRole('table')).toBeTruthy()
    expect(description.closest('td')).toBeTruthy()
    expect(description.value).toBe('Typed before rotating.')
  })
})

describe('UI-20 (BR-28, BR-14, AC-44): duplicate protection', () => {
  it('holds the form open while saving and reuses the clientRequestId on retry', async () => {
    const pending: { resolve: (reply: Reply) => void; reject: (err: Error) => void }[] = []
    const fetchMock = mockStaffApi({
      onPost: () => new Promise<Reply>((resolve, reject) => pending.push({ resolve, reject })),
    })
    const { user, area } = await openCreate()
    const description = area.getByLabelText(/action description/i) as HTMLTextAreaElement
    await user.type(description, 'Restarted the dock.')
    await user.click(area.getByRole('button', { name: 'Save Action' }))

    const busy = await area.findByRole('button', { name: 'Saving…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect(busy.getAttribute('aria-busy')).toBe('true')

    // While the request is out, Esc, Cancel, and Enter in a text input must
    // neither close the form nor send a second request (PR #80 review).
    const cancel = area.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    await user.click(cancel)
    await user.click(area.getByLabelText(/attachment notes/i))
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')
    expect(area.getByRole('heading', { name: 'New Action' })).toBeTruthy()
    expect(callsTo(fetchMock, 'POST')).toHaveLength(1)

    // The first attempt fails: the form, its text, and the error all remain.
    pending[0]!.reject(new TypeError('Failed to fetch'))
    expect((await area.findByTestId('action-form-error')).textContent).toBe(
      'Something went wrong. Please try again.',
    )
    expect(area.getByRole('heading', { name: 'New Action' })).toBeTruthy()
    expect(description.value).toBe('Restarted the dock.')

    // The retry, double-clicked, sends one request with the same key.
    await user.dblClick(area.getByRole('button', { name: 'Save Action' }))
    await area.findByRole('button', { name: 'Saving…' })
    expect(callsTo(fetchMock, 'POST')).toHaveLength(2)
    expect(bodyOf(fetchMock, 'POST', 1).clientRequestId).toBe(
      bodyOf(fetchMock, 'POST', 0).clientRequestId,
    )

    pending[1]!.resolve({
      status: 200,
      body: action({ id: 7001, description: 'Restarted the dock.' }),
    })
    expect(await area.findByText('Restarted the dock.')).toBeTruthy()
    expect(rows()).toHaveLength(1)
  })
})

describe('UI-21 (AC-12, BR-10): non-active Ticket', () => {
  it('hides Add Action and Edit and explains how to record more', async () => {
    mockStaffApi({
      actions: [[action({ status: 'DONE', result: 'Fixed.' })]],
      details: [staffDetail({ currentStatus: 'RESOLVED' })],
    })
    renderAt('/staff/tickets/101')
    const area = await section()
    expect(
      area.getByText('This ticket is Resolved. Reopen it to record more actions.'),
    ).toBeTruthy()
    expect(area.queryByRole('button', { name: 'Add Action' })).toBeNull()
    expect(area.queryByRole('button', { name: /edit/i })).toBeNull()
  })

  it('shows TICKET_NOT_ACTIONABLE in the panel with Reload ticket', async () => {
    mockStaffApi({
      details: [staffDetail(), staffDetail({ currentStatus: 'RESOLVED' })],
      onPost: () => ({
        status: 409,
        body: { error: { code: 'TICKET_NOT_ACTIONABLE', message: 'Not active.' } },
      }),
    })
    const { user, area } = await openCreate()
    await user.type(area.getByLabelText(/action description/i), 'Late note.')
    await user.click(area.getByRole('button', { name: 'Save Action' }))

    const banner = await area.findByTestId('action-form-error')
    expect(banner.textContent).toContain('This ticket is no longer open for actions.')
    await user.click(within(banner).getByRole('button', { name: 'Reload ticket' }))
    expect(
      await area.findByText('This ticket is Resolved. Reopen it to record more actions.'),
    ).toBeTruthy()
  })
})

describe('UI-22 (AC-07, BR-12): Requester view', () => {
  it('shows every field read-only from the Requester endpoint', async () => {
    const ticket: TicketDetail = {
      id: 101,
      ticketNumber: 'TKT-2026-000101',
      requester: { id: 7, name: 'Priya Shah' },
      ownerName: 'Sarah Johnson',
      category: { id: 1, name: 'Hardware' },
      relatedSystem: { id: 1, name: 'Corporate Laptop' },
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      summary: 'Laptop battery drains quickly',
      description: 'Drains fast.',
      currentStatus: 'IN_PROGRESS',
      requesterConfirmedResolvedAt: null,
      createdAt: '2026-10-01T02:00:00.000Z',
      updatedAt: '2026-10-01T02:00:00.000Z',
      attachments: [],
      comments: [],
    }
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/auth/me') return jsonResponse(testUser)
      if (url === '/api/tickets/101') return jsonResponse(ticket)
      if (url === '/api/tickets/101/status-history') return jsonResponse({ data: [] })
      if (url === '/api/tickets/101/actions') {
        return jsonResponse({
          data: [
            action({
              status: 'DONE',
              result: 'Battery replaced.',
              followUpRequired: true,
              followUpNote: 'Check in a week.',
              attachmentNotes: 'receipt.pdf',
              assignedTo: { ...ahmed, isActive: true },
            }),
          ],
        })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/tickets/101')
    const area = await section()

    expect(area.getByText('Work recorded by IT Staff on your ticket.')).toBeTruthy()
    for (const text of [
      'Ran the battery diagnostic.',
      'Battery replaced.',
      'Sarah Johnson',
      'Ahmed Hassan',
      'Done',
      'Check in a week.',
    ]) {
      expect(area.getByText(text)).toBeTruthy()
    }
    expect(area.getByText(/Files: receipt\.pdf/)).toBeTruthy()
    expect(area.queryByRole('button')).toBeNull()
    expect(area.queryByRole('textbox')).toBeNull()
    expect(area.queryByRole('columnheader', { name: 'Edit' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/api/staff/'))).toBe(false)
  })
})

describe('UI-23 (AC-42): keyboard', () => {
  it('tabs through the form in order, and Esc cancels back to Add Action', async () => {
    const fetchMock = mockStaffApi()
    const { user, area } = await openCreate()

    const order = [
      /action date\/time/i,
      /^status/i,
      /action description/i,
      /^result/i,
      /assigned to/i,
    ]
    for (const label of order) {
      await user.tab()
      expect(document.activeElement).toBe(area.getByLabelText(label))
    }
    await user.tab()
    expect(document.activeElement).toBe(area.getByRole('checkbox', { name: 'Follow-Up Required?' }))

    await user.type(area.getByLabelText(/action description/i), 'Draft')
    await user.keyboard('{Escape}')
    expect(area.queryByRole('heading', { name: 'New Action' })).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(area.getByRole('button', { name: 'Add Action' })),
    )
    expect(callsTo(fetchMock, 'POST')).toHaveLength(0)
  })
})
