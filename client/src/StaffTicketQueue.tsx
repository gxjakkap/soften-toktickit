import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, fetchActiveItStaff, fetchCategories, fetchStaffTickets } from './apiClient'
import { PriorityBadge, StatusBadge } from './badges'
import { EmptyState, ErrorState, Forbidden } from './FeedbackState'
import { formatBangkokDate, formatDate } from './lib/datetime'
import { roleHomePath } from './lib/role-routes'
import { useAuth } from './useAuth'
import type {
  ActiveStaffUser,
  Category,
  RequestedPriority,
  SortDirection,
  TicketQueueResponse,
  TicketQueueSortField,
  TicketStatus,
} from './types'

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden'

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 300

// Lab 4 ui-spec.md §2.5 (FR-16, AC-47): every filter, the sort, and the page
// live in the URL query string, so a dashboard drill-down link reproduces
// the filtered view. Clear Filters removes these and keeps the sort.
const FILTER_PARAMS = [
  'search',
  'categoryId',
  'requestedPriority',
  'itPriority',
  'status',
  'ownerId',
  'statusGroup',
  'resolvedFrom',
  'resolvedTo',
  'followUp',
  'openActionAssigneeId',
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

const PRIORITY_LABEL: Record<RequestedPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

// ui-spec.md §5: Ticket No., Created Date, Req./IT Priority, and Status are
// sortable; Category and Owner are display-only (api-spec.md §4.1 omits
// them from the sortable set too).
const SORTABLE_COLUMNS: { field: TicketQueueSortField; label: string }[] = [
  { field: 'ticketNumber', label: 'Ticket No.' },
  { field: 'createdAt', label: 'Created Date' },
  { field: 'requestedPriority', label: 'Req. Priority' },
  { field: 'itPriority', label: 'IT Priority' },
  { field: 'currentStatus', label: 'Status' },
]

function StaffTicketQueue() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [state, setState] = useState<LoadState>('loading')
  const [invalidFilter, setInvalidFilter] = useState(false)
  const [response, setResponse] = useState<TicketQueueResponse | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [staff, setStaff] = useState<ActiveStaffUser[]>([])

  const [params, setParams] = useSearchParams()
  const param = (key: string) => params.get(key) ?? ''
  const search = param('search')
  const categoryId = param('categoryId')
  const requestedPriority = param('requestedPriority')
  const itPriority = param('itPriority')
  const status = param('status')
  const ownerId = param('ownerId')
  const statusGroup = param('statusGroup')
  const resolvedFrom = param('resolvedFrom')
  const resolvedTo = param('resolvedTo')
  const followUp = param('followUp')
  const openActionAssigneeId = param('openActionAssigneeId')
  const sortBy = (params.get('sortBy') ?? 'createdAt') as TicketQueueSortField
  const sortDir = (params.get('sortDir') ?? 'asc') as SortDirection
  const page = Number(params.get('page')) || 1

  const [searchInput, setSearchInput] = useState(search)
  // The box follows the URL when something else changes `search` (a nav
  // link, Back), but not when the debounce below wrote the box's own value.
  const [syncedSearch, setSyncedSearch] = useState(search)
  if (search !== syncedSearch) {
    setSyncedSearch(search)
    if (search !== searchInput.trim()) setSearchInput(search)
  }
  const [filtersOpen, setFiltersOpen] = useState(false)

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

  // Lab 4 BR-29: the Administrator uses the Queue like IT Staff.
  const allowed = user?.role === 'IT_STAFF' || user?.role === 'ADMINISTRATOR'
  const myId = user ? String(user.id) : ''

  useEffect(() => {
    if (!allowed) return
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [allowed])

  // ui-spec.md §2.5: "Owner: <name>" and "Open actions: <name>" chips need a
  // name for an id that isn't the caller's, so look it up only then.
  const needsNames =
    (ownerId !== '' && ownerId !== 'unassigned' && ownerId !== myId) ||
    (openActionAssigneeId !== '' && openActionAssigneeId !== myId)
  useEffect(() => {
    if (!allowed || !needsNames) return
    fetchActiveItStaff()
      .then(setStaff)
      .catch(() => setStaff([]))
  }, [allowed, needsNames])
  const userName = (id: string) => staff.find((s) => String(s.id) === id)?.name ?? `User #${id}`

  // AC-22: the Queue narrows as IT Staff types, without a request per keystroke.
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
    fetchStaffTickets({
      search: search || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      requestedPriority: (requestedPriority || undefined) as never,
      itPriority: (itPriority || undefined) as never,
      status: (status || undefined) as never,
      ownerId: ownerId === 'unassigned' ? 'unassigned' : ownerId ? (ownerId as never) : undefined,
      statusGroup: (statusGroup || undefined) as never,
      resolvedFrom: resolvedFrom || undefined,
      resolvedTo: resolvedTo || undefined,
      followUp: (followUp || undefined) as never,
      openActionAssigneeId: openActionAssigneeId ? (openActionAssigneeId as never) : undefined,
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
        // Lab 4 ui-spec.md §11: an API 403 shows the forbidden state.
        setState(err instanceof ApiError && err.code === 'FORBIDDEN' ? 'forbidden' : 'error')
      })
  }, [
    user,
    allowed,
    search,
    categoryId,
    requestedPriority,
    itPriority,
    status,
    ownerId,
    statusGroup,
    resolvedFrom,
    resolvedTo,
    followUp,
    openActionAssigneeId,
    sortBy,
    sortDir,
    page,
    updateParams,
  ])

  useEffect(load, [load])

  const toggleSort = (field: TicketQueueSortField) => {
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

  const activeFilterChips: { key: string; label: string; clear: () => void }[] = []
  if (categoryId) {
    const name = categories.find((c) => String(c.id) === categoryId)?.name ?? categoryId
    activeFilterChips.push({
      key: 'category',
      label: `Category: ${name}`,
      clear: () => setFilter('categoryId')(''),
    })
  }
  if (requestedPriority) {
    activeFilterChips.push({
      key: 'requestedPriority',
      label: `Req. Priority: ${PRIORITY_LABEL[requestedPriority as RequestedPriority] ?? requestedPriority}`,
      clear: () => setFilter('requestedPriority')(''),
    })
  }
  if (itPriority) {
    activeFilterChips.push({
      key: 'itPriority',
      label: `IT Priority: ${PRIORITY_LABEL[itPriority as RequestedPriority] ?? itPriority}`,
      clear: () => setFilter('itPriority')(''),
    })
  }
  if (status) {
    activeFilterChips.push({
      key: 'status',
      label: `Status: ${STATUS_LABEL[status as TicketStatus] ?? status}`,
      clear: () => setFilter('status')(''),
    })
  }
  if (ownerId) {
    const name =
      ownerId === 'unassigned' ? 'Unassigned' : ownerId === myId ? 'Me' : userName(ownerId)
    activeFilterChips.push({
      key: 'owner',
      label: `Owner: ${name}`,
      clear: () => setFilter('ownerId')(''),
    })
  }
  // Lab 4 ui-spec.md §2.5: drill-down-only filters appear as chips, not in
  // the Filters panel.
  if (statusGroup) {
    activeFilterChips.push({
      key: 'statusGroup',
      label: 'Active only',
      clear: () => setFilter('statusGroup')(''),
    })
  }
  if (resolvedFrom || resolvedTo) {
    const label =
      resolvedFrom && resolvedFrom === resolvedTo
        ? `Resolved ${formatBangkokDate(resolvedFrom)}`
        : [
            resolvedFrom && `Resolved since ${formatBangkokDate(resolvedFrom)}`,
            resolvedTo && `Resolved until ${formatBangkokDate(resolvedTo)}`,
          ]
            .filter(Boolean)
            .join(', ')
    activeFilterChips.push({
      key: 'resolved',
      label,
      clear: () => updateParams({ resolvedFrom: '', resolvedTo: '' }),
    })
  }
  if (followUp) {
    activeFilterChips.push({
      key: 'followUp',
      label: 'Follow-up pending',
      clear: () => setFilter('followUp')(''),
    })
  }
  if (openActionAssigneeId) {
    const name = openActionAssigneeId === myId ? 'me' : userName(openActionAssigneeId)
    activeFilterChips.push({
      key: 'openActionAssigneeId',
      label: `Open actions: ${name}`,
      clear: () => setFilter('openActionAssigneeId')(''),
    })
  }

  const openTicket = (id: number) => navigate(`/staff/tickets/${id}`)

  const isEmptyQueue = state === 'ready' && response?.hasAnyTickets === false
  const isNoResults =
    state === 'ready' && response !== null && response.hasAnyTickets && response.totalCount === 0
  const hasRows = state === 'ready' && response !== null && response.data.length > 0

  const rangeStart =
    response && response.totalCount > 0 ? (response.page - 1) * response.pageSize + 1 : 0
  const rangeEnd = response ? Math.min(response.page * response.pageSize, response.totalCount) : 0

  // ui-spec.md §5: a Requester reaching this route directly gets a full-page
  // forbidden state, never a silent redirect — the API already returns 403.
  if (!allowed || state === 'forbidden') {
    return <Forbidden testId="queue-forbidden" homeTo={user ? roleHomePath(user.role) : '/login'} />
  }

  return (
    <div>
      <div className="zg-actions">
        <div>
          <h1 className="zg-title">Ticket Queue</h1>
          <p className="zg-helper">Search, filter, and open any Ticket in the shared queue.</p>
        </div>
        {!isEmptyQueue && !isNoResults && !invalidFilter && (
          <button type="button" className="zg-btn zg-btn-tertiary" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {!isEmptyQueue && (
        <div style={{ marginTop: 'var(--zg-space-4)' }}>
          <div className="zg-filter-row">
            <div className="zg-filter-field" style={{ flex: '2 1 280px' }}>
              <label className="zg-label" htmlFor="queue-search">
                Search
              </label>
              <input
                id="queue-search"
                className="zg-field"
                type="text"
                placeholder="Search by ticket number or summary…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              aria-expanded={filtersOpen}
              aria-controls="queue-filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <i className="bi bi-funnel" aria-hidden="true" />
              Filters
            </button>
          </div>

          {filtersOpen && (
            <div
              id="queue-filter-panel"
              className="zg-filter-panel"
              style={{ marginTop: 'var(--zg-space-3)' }}
            >
              <div>
                <label className="zg-label" htmlFor="queue-category">
                  Category
                </label>
                <select
                  id="queue-category"
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
              <div>
                <label className="zg-label" htmlFor="queue-requested-priority">
                  Requested Priority
                </label>
                <select
                  id="queue-requested-priority"
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
              <div>
                <label className="zg-label" htmlFor="queue-it-priority">
                  IT Priority
                </label>
                <select
                  id="queue-it-priority"
                  className="zg-field"
                  value={itPriority}
                  onChange={(e) => setFilter('itPriority')(e.target.value)}
                >
                  <option value="">All Priorities</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
              <div>
                <label className="zg-label" htmlFor="queue-status">
                  Current Status
                </label>
                <select
                  id="queue-status"
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
              <div>
                <label className="zg-label" htmlFor="queue-owner">
                  Owner
                </label>
                <select
                  id="queue-owner"
                  className="zg-field"
                  value={ownerId}
                  onChange={(e) => setFilter('ownerId')(e.target.value)}
                >
                  <option value="">All Owners</option>
                  <option value="unassigned">Unassigned</option>
                  <option value={myId}>Assigned to me</option>
                  {ownerId && ownerId !== 'unassigned' && ownerId !== myId && (
                    <option value={ownerId}>{userName(ownerId)}</option>
                  )}
                </select>
              </div>
            </div>
          )}

          {activeFilterChips.length > 0 && (
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
        </div>
      )}

      {state === 'loading' && !response && (
        <p className="zg-skeleton" aria-live="polite" style={{ marginTop: 'var(--zg-space-4)' }}>
          Loading the Ticket Queue…
        </p>
      )}

      {state === 'error' &&
        (invalidFilter ? (
          <ErrorState
            message="This link has a filter the Ticket Queue does not recognize."
            actionLabel="Clear filters"
            onAction={clearAllParams}
          />
        ) : (
          <ErrorState
            message="Unable to load the Ticket Queue. Please try again."
            onAction={load}
          />
        ))}

      {isEmptyQueue && <EmptyState icon="bi-inbox" title="No tickets exist yet" />}

      {isNoResults && (
        <EmptyState title="No tickets match your filters">
          <button type="button" className="zg-btn zg-btn-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </EmptyState>
      )}

      {hasRows && response && (
        <>
          {sortBy === 'createdAt' && sortDir === 'asc' && (
            <p className="zg-sort-indicator" style={{ marginTop: 'var(--zg-space-3)' }}>
              Sorted oldest first
            </p>
          )}

          <div
            className="zg-table-wrap"
            data-testid="queue-table"
            style={{ marginTop: 'var(--zg-space-3)' }}
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
                  <th>Summary</th>
                  <th>Category</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {response.data.map((t) => (
                  <tr key={t.id} onClick={() => openTicket(t.id)}>
                    <td>
                      <Link to={`/staff/tickets/${t.id}`} onClick={(e) => e.stopPropagation()}>
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td>
                      <time dateTime={t.createdAt}>{formatDate(t.createdAt)}</time>
                    </td>
                    <td>
                      <PriorityBadge priority={t.requestedPriority} />
                    </td>
                    <td>
                      <PriorityBadge priority={t.itPriority} />
                    </td>
                    <td>
                      <StatusBadge status={t.currentStatus} />
                    </td>
                    <td>{t.summary}</td>
                    <td>{t.categoryName}</td>
                    <td>{t.ownerName ?? <span className="zg-helper">Unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="zg-ticket-cards"
            data-testid="queue-cards"
            style={{ marginTop: 'var(--zg-space-4)' }}
          >
            {response.data.map((t) => (
              <Link key={t.id} to={`/staff/tickets/${t.id}`} className="zg-ticket-card">
                <div className="zg-ticket-card-header">
                  <strong>{t.ticketNumber}</strong>
                </div>
                <p style={{ margin: 'var(--zg-space-1) 0' }}>{t.summary}</p>
                <div className="zg-actions zg-card-badges">
                  {/* Two priority badges need their names on a card, where
                      no column header says which is which. */}
                  <span className="zg-card-badge">
                    <span className="zg-helper">Requested</span>
                    <PriorityBadge priority={t.requestedPriority} />
                  </span>
                  <span className="zg-card-badge">
                    <span className="zg-helper">IT</span>
                    <PriorityBadge priority={t.itPriority} />
                  </span>
                  <StatusBadge status={t.currentStatus} />
                </div>
                <p className="zg-helper" style={{ marginTop: 'var(--zg-space-2)' }}>
                  Owner: {t.ownerName ?? 'Unassigned'}
                </p>
                <p className="zg-helper">
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

export default StaffTicketQueue
