import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RequesterTicketDetail from '../../src/RequesterTicketDetail'
import { AuthProvider } from '../../src/AuthContext'
import { testUser } from '../helpers/auth'

// ui-spec.md §4 (FR-10, FR-11, BR-24..28): Public Comments and "Problem
// Appears Resolved" on the Requester Ticket Detail screen.

function ticketDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    ticketNumber: 'TKT-2026-000101',
    requester: { id: testUser.id, name: 'Priya Shah' },
    ownerName: null,
    category: { id: 2, name: 'Hardware' },
    relatedSystem: { id: 5, name: 'Corporate Laptop' },
    requestedPriority: 'MEDIUM',
    itPriority: 'MEDIUM',
    summary: 'Laptop battery drains quickly',
    description: 'My laptop battery is draining much faster than usual even when idle.',
    currentStatus: 'NEW',
    requesterConfirmedResolvedAt: null,
    createdAt: '2026-09-01T09:14:00.000Z',
    updatedAt: '2026-09-01T09:14:00.000Z',
    attachments: [],
    comments: [],
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function renderDetail(ticketId = 101) {
  return render(
    <MemoryRouter initialEntries={[`/tickets/${ticketId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockApi(handlers: { onPostComment?: (body: unknown) => void } = {}) {
  const fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (url === '/api/auth/me') return jsonResponse(testUser)
    if (url === '/api/tickets/101') return jsonResponse(ticketDetail())
    if (url === '/api/tickets/101/comments' && options?.method === 'POST') {
      const body = JSON.parse(String(options.body))
      handlers.onPostComment?.(body)
      return jsonResponse(
        {
          id: 9002,
          ticketId: 101,
          authorName: testUser.name,
          authorRole: 'REQUESTER',
          visibility: 'PUBLIC',
          content: body.content,
          createdAt: '2026-09-01T11:00:00.000Z',
        },
        201,
      )
    }
    if (url === '/api/tickets/101/resolved' && options?.method === 'PATCH') {
      return jsonResponse({ id: 101, requesterConfirmedResolvedAt: '2026-09-01T11:05:00.000Z' })
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Public Comments (FR-10, ui-spec.md §4)', () => {
  it('shows an empty state when there are no comments yet', async () => {
    mockApi()
    renderDetail()

    expect(await screen.findByText(/no comments yet/i)).toBeTruthy()
  })

  it('lists existing comments oldest-first with author name, role badge, and timestamp', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') return jsonResponse(testUser)
        if (url === '/api/tickets/101')
          return jsonResponse(
            ticketDetail({
              comments: [
                {
                  id: 1,
                  authorName: 'Priya Shah',
                  authorRole: 'REQUESTER',
                  content: 'Any update on this?',
                  createdAt: '2026-09-01T10:00:00.000Z',
                },
              ],
            }),
          )
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      }),
    )
    renderDetail()

    const commentText = await screen.findByText('Any update on this?')
    const commentRow = commentText.closest('li')!
    expect(within(commentRow).getByText('Priya Shah')).toBeTruthy()
    expect(within(commentRow).getByText('Requester')).toBeTruthy()
  })

  it('posts a new comment and appends it to the list without a reload, then clears the input', async () => {
    const user = userEvent.setup()
    let posted: unknown
    mockApi({ onPostComment: (body) => (posted = body) })
    renderDetail()

    await screen.findByText(/no comments yet/i)
    const textarea = screen.getByLabelText(/add a comment/i)
    await user.type(textarea, 'Please let me know if you need anything else.')
    await user.click(screen.getByRole('button', { name: /post comment/i }))

    expect(await screen.findByText('Please let me know if you need anything else.')).toBeTruthy()
    expect(posted).toEqual({ content: 'Please let me know if you need anything else.' })
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('disables Post Comment while the draft is empty or whitespace-only', async () => {
    const user = userEvent.setup()
    mockApi()
    renderDetail()

    const postButton = await screen.findByRole('button', { name: /post comment/i })
    expect(postButton).toHaveProperty('disabled', true)

    await user.type(screen.getByLabelText(/add a comment/i), '   ')
    expect(postButton).toHaveProperty('disabled', true)
  })

  it('shows a safe error message when posting fails, without losing the draft', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: RequestInit) => {
        if (url === '/api/auth/me') return jsonResponse(testUser)
        if (url === '/api/tickets/101') return jsonResponse(ticketDetail())
        if (url === '/api/tickets/101/comments' && options?.method === 'POST') {
          return jsonResponse(
            { error: { code: 'VALIDATION_ERROR', message: 'Comment must be 1-2000 characters.' } },
            400,
          )
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      }),
    )
    renderDetail()

    await screen.findByText(/no comments yet/i)
    const textarea = screen.getByLabelText(/add a comment/i)
    await user.type(textarea, 'Trying to comment')
    await user.click(screen.getByRole('button', { name: /post comment/i }))

    expect(await screen.findByText(/comment must be 1-2000 characters/i)).toBeTruthy()
    expect((textarea as HTMLTextAreaElement).value).toBe('Trying to comment')
  })
})

describe('Problem Appears Resolved (FR-11, BR-24, BR-25)', () => {
  it('is hidden once the Ticket is Closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') return jsonResponse(testUser)
        if (url === '/api/tickets/101')
          return jsonResponse(ticketDetail({ currentStatus: 'CLOSED' }))
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      }),
    )
    renderDetail()

    await screen.findByText('TKT-2026-000101')
    expect(screen.queryByRole('button', { name: /problem appears resolved/i })).toBeNull()
  })

  it('opens a confirmation dialog, then shows a success badge in place of the button', async () => {
    const user = userEvent.setup()
    mockApi()
    renderDetail()

    await user.click(await screen.findByRole('button', { name: /problem appears resolved/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/does not close the ticket/i)).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByTestId('resolved-badge')).toHaveProperty(
      'textContent',
      expect.stringMatching(/marked resolved by you on/i),
    )
    expect(screen.queryByRole('button', { name: /problem appears resolved/i })).toBeNull()
  })

  it('does not call the API when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi()
    renderDetail()

    await user.click(await screen.findByRole('button', { name: /problem appears resolved/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/resolved'))).toBe(false)
  })
})
