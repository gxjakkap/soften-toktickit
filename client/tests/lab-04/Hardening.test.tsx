import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testStaffUser } from '../helpers/auth'
import type { StaffTicketDetail } from '../../src/types'

// UI-39..UI-46 — AC-34, AC-37, AC-41, AC-42, AC-44: docs/lab-04 ui-spec.md
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
