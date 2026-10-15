import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, fetchCategories, fetchTickets } from './apiClient'
import { PriorityBadge, StatusBadge } from './badges'
import Forbidden from './Forbidden'
import { formatBangkokDate, formatDate } from './lib/datetime'
import { roleHomePath } from './lib/role-routes'
import { useAuth } from './useAuth'
import type {
  Category,
  SortDirection,
  TicketListResponse,
  TicketSortField,
  TicketStatus,
} from './types'

type LoadState = 'loading' | 'ready' | 'error'

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 300

// Lab 4 ui-spec.md §2.5 (FR-16, AC-47): filters, sort, and page live in the
// URL query string, so a Requester dashboard drill-down reproduces the
// filtered view. Only these params reach the API, and the server scopes
// every query to the session (BR-31), so a hand-edited URL can narrow the
// list but never widen it to another Requester's Tickets.
const FILTER_PARAMS = [
  'search',
  'categoryId',
  'requestedPriority',
  'status',
  'statusGroup',
  'resolvedFrom',
]

const STATUS_OPTIONS: TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
}

// ui-spec.md §11.3: only these columns are sortable (BR-18); Category and
// Last Updated are display-only.
const SORTABLE_COLUMNS: { field: TicketSortField; label: string }[] = [
  { field: 'ticketNumber', label: 'Ticket No.' },
  { field: 'createdAt', label: 'Created Date' },
  { field: 'summary', label: 'Summary' },
  { field: 'requestedPriority', label: 'Requested Priority' },
  { field: 'currentStatus', label: 'Current Status' },
]

function MyTickets() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // !user: the session hasn't resolved yet (direct-render tests, or a brief
  // window before RequireAuth would normally gate this) — defer judgment
  // rather than flashing Forbidden before the role is even known.
  const allowed = !user || user.role === 'REQUESTER'

  const [state, setState] = useState<LoadState>('loading')
  const [invalidFilter, setInvalidFilter] = useState(false)
  const [response, setResponse] = useState<TicketListResponse | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  const [params, setParams] = useSearchParams()
  const param = (key: string) => params.get(key) ?? ''
  const search = param('search')
  const categoryId = param('categoryId')
  const requestedPriority = param('requestedPriority')
  const status = param('status')
  const statusGroup = param('statusGroup')
  const resolvedFrom = param('resolvedFrom')
  const sortBy = (params.get('sortBy') ?? 'createdAt') as TicketSortField
  const sortDir = (params.get('sortDir') ?? 'desc') as SortDirection
  const page = Number(params.get('page')) || 1

  const [searchInput, setSearchInput] = useState(search)
  // The box follows the URL when something else changes `search` (a nav
  // link, Back), but not when the debounce below wrote the box's own value.
  const [syncedSearch, setSyncedSearch] = useState(search)
  if (search !== syncedSearch) {
    setSyncedSearch(search)
    if (search !== searchInput.trim()) setSearchInput(search)
  }

  // FR-16: write every change back with replace navigation. A filter change
  // returns to page 1.
  const updateParams = useCallback(
    (changes: Record<string, string>, resetPage = true) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          if (resetPage) next.delete('page')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const setFilter = (key: string) => (value: string) => updateParams({ [key]: value })

  useEffect(() => {
    if (!allowed) return
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [allowed])

  // AC-16: the list narrows as the Requester types, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== search) updateParams({ search: searchInput.trim() })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, search, updateParams])

  const load = useCallback(() => {
    if (!user || !allowed) return
    setState('loading')
    setInvalidFilter(false)
    fetchTickets({
      search: search || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      requestedPriority: (requestedPriority || undefined) as never,
      status: (status || undefined) as never,
      statusGroup: (statusGroup || undefined) as never,
      resolvedFrom: resolvedFrom || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        // FR-16: a reloaded or bookmarked page can sit past the end once
        // Tickets leave the filter; move to the last page and fetch again.
        if (data.totalCount > 0 && page > data.totalPages) {
          updateParams({ page: data.totalPages > 1 ? String(data.totalPages) : '' }, false)
          return
        }
        setResponse(data)
        setState('ready')
      })
      .catch((err) => {
        // ui-spec.md §2.5: a bad URL param gets a Clear filters action.
        setInvalidFilter(err instanceof ApiError && err.code === 'INVALID_FILTER')
        setState('error')
      })
  }, [
    user,
    allowed,
    search,
    categoryId,
    requestedPriority,
    status,
    statusGroup,
    resolvedFrom,
    sortBy,
    sortDir,
    page,
    updateParams,
  ])

  useEffect(load, [load])

  const toggleSort = (field: TicketSortField) => {
    const nextDir = field === sortBy && sortDir === 'asc' ? 'desc' : 'asc'
    updateParams({ sortBy: field, sortDir: nextDir }, false)
  }
  const setPage = (next: number) => updateParams({ page: next > 1 ? String(next) : '' }, false)

  const clearFilters = () => {
    setSearchInput('')
    updateParams(Object.fromEntries(FILTER_PARAMS.map((key) => [key, ''])))
  }
  // INVALID_FILTER also covers a bad sortBy or sortDir, so the banner's
  // Clear filters drops every param, sort included.
  const clearAllParams = () => {
    setSearchInput('')
    setParams({}, { replace: true })
  }

  // Lab 4 ui-spec.md §2.5: drill-down-only filters show as removable chips,
  // not in the Filters row, which keeps the Lab 2 controls.
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = []
  if (statusGroup) {
    activeFilterChips.push({
      key: 'statusGroup',
      label: 'Active only',
      clear: () => setFilter('statusGroup')(''),
    })
  }
  if (resolvedFrom) {
    activeFilterChips.push({
      key: 'resolvedFrom',
      label: `Resolved since ${formatBangkokDate(resolvedFrom)}`,
      clear: () => setFilter('resolvedFrom')(''),
    })
  }

  const openTicket = (id: number) => navigate(`/tickets/${id}`)

  const isEmptyAccount = state === 'ready' && response?.hasAnyTickets === false
  const isNoResults =
    state === 'ready' && response !== null && response.hasAnyTickets && response.totalCount === 0
  const hasRows = state === 'ready' && response !== null && response.data.length > 0

  const rangeStart =
    response && response.totalCount > 0 ? (response.page - 1) * response.pageSize + 1 : 0
  const rangeEnd = response ? Math.min(response.page * response.pageSize, response.totalCount) : 0

  // specification.md §12-14: an IT Staff or Administrator reaching this
  // Requester route directly gets the same full-page forbidden state as
  // the IT Staff/Administrator screens, never a silent error banner.
  if (!allowed) {
    return (
      <Forbidden testId="my-tickets-forbidden" homeTo={user ? roleHomePath(user.role) : '/login'} />
    )
  }

  return (
    <div>
      <div className="zg-actions">
        <div>
          <h1 className="zg-title">My Tickets</h1>
          <p className="zg-helper">Search, filter, and open the Tickets you've submitted.</p>
        </div>
        {!isEmptyAccount && (
          <div className="zg-actions" style={{ justifyContent: 'flex-end' }}>
            {!isNoResults && (
              <button type="button" className="zg-btn zg-btn-tertiary" onClick={clearFilters}>
                Clear Filters
              </button>
            )}
            <Link to="/tickets/new" className="zg-btn zg-btn-primary zg-btn-sm">
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Create Ticket
            </Link>
          </div>
        )}
      </div>

      {!isEmptyAccount && (
        <div className="zg-filter-row" style={{ marginTop: 'var(--zg-space-4)' }}>
          <div className="zg-filter-field">
            <label className="zg-label" htmlFor="my-tickets-search">
              Search
            </label>
            <input
              id="my-tickets-search"
              className="zg-field"
              type="text"
              placeholder="Search by ticket number or summary…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="zg-filter-field">
            <label className="zg-label" htmlFor="my-tickets-category">
              Category
            </label>
            <select
              id="my-tickets-category"
              className="zg-field"
              value={categoryId}
              onChange={(e) => setFilter('categoryId')(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="zg-filter-field">
            <label className="zg-label" htmlFor="my-tickets-priority">
              Requested Priority
            </label>
            <select
              id="my-tickets-priority"
              className="zg-field"
              value={requestedPriority}
              onChange={(e) => setFilter('requestedPriority')(e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="zg-filter-field">
            <label className="zg-label" htmlFor="my-tickets-status">
              Current Status
            </label>
            <select
              id="my-tickets-status"
              className="zg-field"
              value={status}
              onChange={(e) => setFilter('status')(e.target.value)}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!isEmptyAccount && activeFilterChips.length > 0 && (
        <div className="zg-chip-row" style={{ marginTop: 'var(--zg-space-3)' }}>
          {activeFilterChips.map((chip) => (
            <span key={chip.key} className="zg-chip">
              {chip.label}
              <button
                type="button"
                aria-label={`Remove filter: ${chip.label}`}
                onClick={chip.clear}
              >
                <i className="bi bi-x" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {state === 'loading' && !response && (
        <p className="zg-skeleton" aria-live="polite" style={{ marginTop: 'var(--zg-space-4)' }}>
          Loading your tickets…
        </p>
      )}

      {state === 'error' && (
        <div style={{ marginTop: 'var(--zg-space-4)' }}>
          <p className="zg-error" role="alert">
            {invalidFilter
              ? 'This link has a filter My Tickets does not recognize.'
              : 'Unable to load your tickets. Please try again.'}
          </p>
          {invalidFilter ? (
            <button type="button" className="zg-btn zg-btn-secondary" onClick={clearAllParams}>
              Clear filters
            </button>
          ) : (
            <button type="button" className="zg-btn zg-btn-secondary" onClick={load}>
              Retry
            </button>
          )}
        </div>
      )}

      {isEmptyAccount && (
        <div className="zg-callout" style={{ marginTop: 'var(--zg-space-5)', textAlign: 'center' }}>
          <i className="bi bi-inbox" aria-hidden="true" style={{ fontSize: '32px' }} />
          <p className="zg-title" style={{ fontSize: '18px', marginTop: 'var(--zg-space-3)' }}>
            You haven't created any tickets yet
          </p>
          <Link
            to="/tickets/new"
            className="zg-btn zg-btn-primary"
            style={{ marginTop: 'var(--zg-space-3)' }}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Create Your First Ticket
          </Link>
        </div>
      )}

      {isNoResults && (
        <div className="zg-callout" style={{ marginTop: 'var(--zg-space-5)', textAlign: 'center' }}>
          <p className="zg-title" style={{ fontSize: '18px' }}>
            No tickets match your filters
          </p>
          <button
            type="button"
            className="zg-btn zg-btn-secondary"
            style={{ marginTop: 'var(--zg-space-3)' }}
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        </div>
      )}

      {hasRows && response && (
        <>
          <div
            className="zg-table-wrap"
            data-testid="tickets-table"
            style={{ marginTop: 'var(--zg-space-4)' }}
          >
            <table className="zg-table">
              <thead>
                <tr>
                  {SORTABLE_COLUMNS.map(({ field, label }) => (
                    <th key={field}>
                      <button
                        type="button"
                        className="zg-sort-btn"
                        onClick={() => toggleSort(field)}
                      >
                        {label}
                        {sortBy === field && (
                          <i
                            className={`bi ${sortDir === 'asc' ? 'bi-caret-up-fill' : 'bi-caret-down-fill'}`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </th>
                  ))}
                  <th>Category</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {response.data.map((t) => (
                  <tr key={t.id} onClick={() => openTicket(t.id)}>
                    <td>
                      <Link to={`/tickets/${t.id}`} onClick={(e) => e.stopPropagation()}>
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td>
                      <time dateTime={t.createdAt}>{formatDate(t.createdAt)}</time>
                    </td>
                    <td>{t.summary}</td>
                    <td>
                      <PriorityBadge priority={t.requestedPriority} />
                    </td>
                    <td>
                      <StatusBadge status={t.currentStatus} />
                    </td>
                    <td>{t.categoryName}</td>
                    <td>
                      <time dateTime={t.updatedAt}>{formatDate(t.updatedAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="zg-ticket-cards"
            data-testid="tickets-cards"
            style={{ marginTop: 'var(--zg-space-4)' }}
          >
            {response.data.map((t) => (
              <Link key={t.id} to={`/tickets/${t.id}`} className="zg-ticket-card">
                <div className="zg-ticket-card-header">
                  <strong>{t.ticketNumber}</strong>
                </div>
                <p style={{ margin: 'var(--zg-space-1) 0' }}>{t.summary}</p>
                <div className="zg-actions">
                  <PriorityBadge priority={t.requestedPriority} />
                  <StatusBadge status={t.currentStatus} />
                </div>
                <p className="zg-helper" style={{ marginTop: 'var(--zg-space-2)' }}>
                  Created <time dateTime={t.createdAt}>{formatDate(t.createdAt)}</time> · Updated{' '}
                  <time dateTime={t.updatedAt}>{formatDate(t.updatedAt)}</time>
                </p>
              </Link>
            ))}
          </div>

          <div className="zg-pagination">
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              disabled={response.page <= 1}
              onClick={() => setPage(response.page - 1)}
            >
              Previous
            </button>
            {/* ui-spec.md §11.3: Previous/Next plus page numbers, not Previous/Next alone. */}
            <nav className="zg-pagination-pages" aria-label="Pagination">
              {Array.from({ length: response.totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`zg-btn zg-btn-sm ${p === response.page ? 'zg-btn-primary' : 'zg-btn-secondary'}`}
                  aria-current={p === response.page ? 'page' : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
            </nav>
            <span className="zg-helper">
              Showing {rangeStart} to {rangeEnd} of {response.totalCount} tickets
            </span>
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              disabled={response.page >= response.totalPages}
              onClick={() => setPage(response.page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default MyTickets
