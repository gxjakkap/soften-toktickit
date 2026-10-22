// UI-38 — AC-37: docs/lab-04 ui-spec.md §2.1 (FR-18, BR-33). With the
// process in New York time, every <time> on My Tickets, both Ticket Detail
// screens, and both dashboards reads Asia/Bangkok. The instant below falls on
// 6 Oct in New York and 7 Oct in Bangkok, so a browser-zone render can't pass.
process.env.TZ = 'America/New_York'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { AuthProvider } from '../../src/AuthContext'
import { testStaffUser, testUser } from '../helpers/auth'
import type { AuthUser } from '../../src/types'

const T = '2026-10-06T20:30:00.000Z'

const bangkok = (iso: string, parts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', ...parts })
    .format(new Date(iso))
    .replace('Sept', 'Sep')
const DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const
const TIME = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const

// The three forms ui-spec.md §2.1 allows: date, date and time, time only.
const bangkokForms = (iso: string) => [
  bangkok(iso, DATE),
  bangkok(iso, { ...DATE, ...TIME }),
  bangkok(iso, TIME),
]

const ticket = {
  id: 101,
  ticketNumber: 'TKT-2026-000101',
  requester: { id: 7, name: 'Jennifer Anderson' },
  ownerName: 'Sarah Johnson',
  ownerId: 12,
  category: { id: 1, name: 'Hardware' },
  relatedSystem: { id: 1, name: 'Corporate Laptop' },
  requestedPriority: 'MEDIUM',
  itPriority: 'MEDIUM',
  summary: 'Laptop battery drains quickly',
  description: 'The battery drains much faster than usual even when idle.',
  currentStatus: 'IN_PROGRESS',
  requesterConfirmedResolvedAt: null,
  createdAt: T,
  updatedAt: T,
  attachments: [],
  comments: [
    {
      id: 1,
      authorName: 'Sarah Johnson',
      authorRole: 'IT_STAFF',
      content: 'On it.',
      createdAt: T,
      visibility: 'PUBLIC',
    },
  ],
  version: 2,
  resolvedAt: null,
  resolutionGate: { canResolve: false, reasons: ['NO_DONE_ACTION'] },
}

const action = {
  id: 5001,
  ticketId: 101,
  actionAt: T,
  description: 'Ran the battery diagnostic.',
  result: null,
  status: 'PLANNED',
  performedBy: { id: 12, name: 'Sarah Johnson', role: 'IT_STAFF' },
  assignedTo: { id: 12, name: 'Sarah Johnson', role: 'IT_STAFF', isActive: true },
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  version: 1,
  createdAt: T,
  updatedAt: T,
}

const history = {
  data: [
    {
      id: 1,
      fromStatus: null,
      toStatus: 'NEW',
      changedBy: { id: 7, name: 'Jennifer Anderson', role: 'REQUESTER' },
      changedAt: T,
    },
  ],
}

const listRow = {
  id: 101,
  ticketNumber: 'TKT-2026-000101',
  summary: 'Laptop battery drains quickly',
  categoryId: 1,
  categoryName: 'Hardware',
  requestedPriority: 'MEDIUM',
  itPriority: 'MEDIUM',
  currentStatus: 'IN_PROGRESS',
  ownerName: 'Sarah Johnson',
  createdAt: T,
  updatedAt: T,
}

const requesterDashboard = {
  generatedAt: T,
  hasAnyTickets: true,
  metrics: {
    openTickets: { value: 1, drillDown: '/tickets?statusGroup=active' },
    waitingForYou: { value: 0, drillDown: '/tickets?status=WAITING_FOR_REQUESTER' },
    resolvedLast30Days: {
      value: 1,
      windowStart: '2026-09-08',
      drillDown: '/tickets?resolvedFrom=2026-09-08',
    },
  },
  recentlyUpdated: [
    {
      id: 101,
      ticketNumber: 'TKT-2026-000101',
      summary: 'Laptop',
      currentStatus: 'IN_PROGRESS',
      updatedAt: T,
    },
  ],
  recentlyResolved: [
    {
      id: 97,
      ticketNumber: 'TKT-2026-000097',
      summary: 'VPN',
      currentStatus: 'CLOSED',
      resolvedAt: T,
    },
  ],
}

const STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]
const staffDashboard = {
  generatedAt: T,
  today: '2026-10-07',
  metrics: {
    myOpenActions: {
      value: 1,
      ticketCount: 1,
      drillDown: '/staff/tickets?openActionAssigneeId=12&statusGroup=active',
    },
    unassigned: { value: 0, drillDown: '/staff/tickets?ownerId=unassigned&statusGroup=active' },
    myActiveTickets: { value: 1, drillDown: '/staff/tickets?ownerId=12&statusGroup=active' },
    followUpsPending: { value: 0, drillDown: '/staff/tickets?followUp=pending&statusGroup=active' },
    highPriority: { value: 0, drillDown: '/staff/tickets?itPriority=HIGH&statusGroup=active' },
    resolvedToday: {
      value: 0,
      drillDown: '/staff/tickets?resolvedFrom=2026-10-07&resolvedTo=2026-10-07',
    },
  },
  byStatus: STATUSES.map((status) => ({
    status,
    value: 0,
    drillDown: `/staff/tickets?status=${status}`,
  })),
  activeByItPriority: ['LOW', 'MEDIUM', 'HIGH'].map((itPriority) => ({
    itPriority,
    value: 0,
    drillDown: `/staff/tickets?itPriority=${itPriority}&statusGroup=active`,
  })),
  myOpenActionList: [
    {
      actionId: 5001,
      ticketId: 101,
      ticketNumber: 'TKT-2026-000101',
      description: 'Ran the battery diagnostic.',
      status: 'PLANNED',
      actionAt: T,
      drillDown: '/staff/tickets/101#actions-taken',
    },
  ],
  recentlyUpdated: [
    {
      id: 101,
      ticketNumber: 'TKT-2026-000101',
      summary: 'Laptop',
      currentStatus: 'IN_PROGRESS',
      ownerName: null,
      updatedAt: T,
    },
  ],
}

const ROUTES: Record<string, unknown> = {
  '/api/categories': [{ id: 1, name: 'Hardware' }],
  '/api/related-systems': [],
  '/api/tickets/101': ticket,
  '/api/tickets/101/actions': { data: [action] },
  '/api/tickets/101/status-history': history,
  '/api/staff/tickets/101': ticket,
  '/api/staff/tickets/101/actions': { data: [action] },
  '/api/staff/tickets/101/status-history': history,
  '/api/staff/it-staff-users': [{ id: 12, name: 'Sarah Johnson', role: 'IT_STAFF' }],
  '/api/dashboard/requester': requesterDashboard,
  '/api/dashboard/staff': staffDashboard,
}

function stubApi(user: AuthUser) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return new Response(JSON.stringify(user))
      if (url.startsWith('/api/tickets?') || url === '/api/tickets')
        return new Response(
          JSON.stringify({
            data: [listRow],
            page: 1,
            pageSize: 10,
            totalCount: 1,
            totalPages: 1,
            hasAnyTickets: true,
          }),
        )
      if (url in ROUTES) return new Response(JSON.stringify(ROUTES[url]))
      throw new Error(`unexpected fetch: ${url}`)
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-38: Bangkok times on every Lab 4 screen under a New York process (AC-37)', () => {
  it('the zone really is New York here', () => {
    expect(new Date(T).getDate()).toBe(6)
  })

  it.each([
    ['My Tickets', testUser, '/tickets'],
    ['Requester Ticket Detail', testUser, '/tickets/101'],
    ['Requester Dashboard', testUser, '/dashboard'],
    ['IT Staff Ticket Detail', testStaffUser, '/staff/tickets/101'],
    ['IT Staff Dashboard', testStaffUser, '/dashboard'],
  ] as const)('%s', async (_screen, user, path) => {
    stubApi(user)
    render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(document.querySelectorAll(`time[datetime="${T}"]`).length).toBeGreaterThan(0),
    )
    // Every <time> on the screen, not just the fixture instant.
    const times = [...document.querySelectorAll('time')]
    for (const el of times) {
      const iso = el.getAttribute('datetime')!
      expect(bangkokForms(iso)).toContain(el.textContent!.trim())
    }
    expect(screen.queryAllByText(/6 Oct 2026/).length).toBe(0)
  })
})
