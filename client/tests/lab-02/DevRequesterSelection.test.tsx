import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../src/App'
import { REQUESTER_STORAGE_KEY, RequesterProvider } from '../../src/RequesterContext'

const activeRequesters = [
  { id: 4, name: 'Jennifer Anderson', email: 'jennifer.anderson@example.com' },
  { id: 2, name: 'Michael Brown', email: 'michael.brown@example.com' },
]

const inactiveRequester = {
  id: 9,
  name: 'Patricia Reyes',
  email: 'patricia.reyes@example.com',
}

// Other tests in this file only exercise the Selection screen and the app
// shell, but Continue navigates into My Tickets, which fetches its own
// data — give those calls a harmless empty response so they don't crash.
function mockRequesters(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/dev-requesters') return Promise.resolve(new Response(JSON.stringify(body), { status }))
      if (url === '/api/categories' || url === '/api/related-systems') {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (url.startsWith('/api/tickets?')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ data: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasAnyTickets: false }),
            { status: 200 },
          ),
        )
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    }),
  )
}

const continueButton = () =>
  screen.getByRole('button', { name: /continue/i }) as HTMLButtonElement

function renderApp(initialEntry = '/select-requester') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RequesterProvider>
        <AppRoutes />
      </RequesterProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  // vitest runs without `globals: true` here, so RTL's auto-cleanup never registers
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('UI-01 (AC-22): Development Requester Selection lists active requesters only', () => {
  it('populates the dropdown from the active-requesters endpoint and shows nothing else', async () => {
    mockRequesters(activeRequesters)
    renderApp()

    const select = await screen.findByLabelText(/development requester/i)
    const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)

    expect(optionLabels.join(' ')).toContain('Jennifer Anderson')
    expect(optionLabels.join(' ')).toContain('Michael Brown')
    expect(optionLabels.join(' ')).not.toContain(inactiveRequester.name)
    expect(fetch).toHaveBeenCalledWith('/api/dev-requesters')
  })

  it('renders requesters in the order the API returned them, without re-sorting', async () => {
    mockRequesters(activeRequesters)
    renderApp()

    const select = await screen.findByLabelText(/development requester/i)
    const values = Array.from(select.querySelectorAll('option'))
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean)

    expect(values).toEqual(['4', '2'])
  })

  it('keeps Continue disabled until a requester is chosen', async () => {
    const user = userEvent.setup()
    mockRequesters(activeRequesters)
    renderApp()

    const select = await screen.findByLabelText(/development requester/i)
    expect(continueButton().disabled).toBe(true)

    await user.selectOptions(select, '2')
    expect(continueButton().disabled).toBe(false)
  })

  it('explains that this is testing only and not a login', async () => {
    mockRequesters(activeRequesters)
    renderApp()

    await screen.findByLabelText(/development requester/i)
    expect(document.body.textContent).toMatch(/not a login screen/i)
    expect(document.body.textContent).toMatch(/only active development requesters are shown/i)
  })

  it('is operable by keyboard alone', async () => {
    const user = userEvent.setup()
    mockRequesters(activeRequesters)
    renderApp()

    const select = await screen.findByLabelText(/development requester/i)
    select.focus()
    await user.selectOptions(select, '4')
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /cancel/i }))
    await user.tab()

    expect(document.activeElement).toBe(continueButton())
  })
})

describe('Development Requester Selection loading and empty states', () => {
  it('shows a loading state with Continue disabled while requesters are fetched', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderApp()

    expect(screen.getByText(/loading development requesters/i)).toBeTruthy()
    expect(continueButton().disabled).toBe(true)
  })

  it('shows an empty state when no active requesters are configured', async () => {
    mockRequesters([])
    renderApp()

    expect(await screen.findByText(/no active development requesters/i)).toBeTruthy()
    expect(screen.queryByLabelText(/development requester/i)).toBeNull()
    expect(continueButton().disabled).toBe(true)
  })
})

describe('UI-02 (AC-21): Development Requester Selection API failure', () => {
  it('shows a safe error state with a retry action and no dropdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    )
    renderApp()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/unable to load development requesters/i)
    expect(screen.queryByLabelText(/development requester/i)).toBeNull()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
    expect(continueButton().disabled).toBe(true)
  })

  it('recovers when retry succeeds', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify(activeRequesters), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderApp()

    await user.click(await screen.findByRole('button', { name: /retry/i }))

    expect(await screen.findByLabelText(/development requester/i)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('treats a non-ok response as a failure rather than rendering a broken dropdown', async () => {
    mockRequesters({ error: { code: 'INTERNAL_ERROR' } }, 500)
    renderApp()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByLabelText(/development requester/i)).toBeNull()
  })
})

describe('UI-03 (AC-02, BR-12): requester-scoped screens redirect when nothing is selected', () => {
  it.each(['/tickets', '/tickets/new', '/tickets/123'])(
    'redirects %s to the selection screen',
    async (path) => {
      mockRequesters(activeRequesters)
      renderApp(path)

      expect(await screen.findByRole('heading', { name: /select development requester/i })).toBeTruthy()
    },
  )

  it('redirects to the selection screen when the stored requester has since been deactivated', async () => {
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(activeRequesters[1]))
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/tickets?')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ error: { code: 'INVALID_REQUESTER', message: 'Requester is not active.' } }),
              { status: 400 },
            ),
          )
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      }),
    )

    renderApp('/tickets')

    expect(await screen.findByRole('heading', { name: /select development requester/i })).toBeTruthy()
    expect(localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull()
  })
})

describe('UI-04 (AC-23, BR-11): change requester', () => {
  it('shows the selected requester in the app shell after Continue', async () => {
    const user = userEvent.setup()
    mockRequesters(activeRequesters)
    renderApp()

    await user.selectOptions(await screen.findByLabelText(/development requester/i), '2')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect((await screen.findByTestId('current-requester')).textContent).toMatch(/michael brown/i)
    expect(JSON.parse(localStorage.getItem(REQUESTER_STORAGE_KEY) ?? 'null')).toMatchObject({
      id: 2,
      name: 'Michael Brown',
    })
  })

  it('clears the previous requester and returns to the selection screen', async () => {
    const user = userEvent.setup()
    mockRequesters(activeRequesters)
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(activeRequesters[1]))
    renderApp('/tickets')

    await user.click(await screen.findByRole('button', { name: /change requester/i }))

    expect(await screen.findByRole('heading', { name: /select development requester/i })).toBeTruthy()
    expect(localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull()
    expect(screen.queryByTestId('current-requester')).toBeNull()
  })

  it('replaces the previous requester everywhere after switching', async () => {
    const user = userEvent.setup()
    mockRequesters(activeRequesters)
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(activeRequesters[1]))
    renderApp('/tickets')

    await user.click(await screen.findByRole('button', { name: /change requester/i }))
    await user.selectOptions(await screen.findByLabelText(/development requester/i), '4')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    const current = await screen.findByTestId('current-requester')
    expect(current.textContent).toMatch(/jennifer anderson/i)
    expect(current.textContent).not.toMatch(/michael brown/i)
    expect(screen.queryByText(/michael brown/i)).toBeNull()
  })

  it('remounts requester-scoped content when the selection changes', async () => {
    const user = userEvent.setup()
    mockRequesters(activeRequesters)
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(activeRequesters[1]))
    renderApp('/tickets')

    const before = await screen.findByTestId('requester-scope')
    expect(before.getAttribute('data-requester-id')).toBe('2')

    await user.click(screen.getByRole('button', { name: /change requester/i }))
    await user.selectOptions(await screen.findByLabelText(/development requester/i), '4')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() =>
      expect(screen.getByTestId('requester-scope').getAttribute('data-requester-id')).toBe('4'),
    )
  })
})
