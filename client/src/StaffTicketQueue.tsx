import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchCategories, fetchStaffTickets } from './apiClient'
import { PriorityBadge, StatusBadge } from './badges'
import Forbidden from './Forbidden'
import { roleHomePath } from './lib/role-routes'
import { useAuth } from './useAuth'
import type {
  Category,
  RequestedPriority,
  SortDirection,
  TicketQueueResponse,
  TicketQueueSortField,
  TicketStatus,
} from './types'

type LoadState = 'loading' | 'ready' | 'error'
type OwnerFilter = '' | 'unassigned' | 'me'

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 300

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function StaffTicketQueue() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [state, setState] = useState<LoadState>('loading')
  const [response, setResponse] = useState<TicketQueueResponse | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [requestedPriority, setRequestedPriority] = useState('')
  const [itPriority, setItPriority] = useState('')
  const [status, setStatus] = useState('')
  const [owner, setOwner] = useState<OwnerFilter>('')
  const [sortBy, setSortBy] = useState<TicketQueueSortField>('createdAt')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const allowed = user?.role === 'IT_STAFF'

  useEffect(() => {
    if (!allowed) return
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [allowed])

  // AC-22: the Queue narrows as IT Staff types, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [search, categoryId, requestedPriority, itPriority, status, owner])

  const load = useCallback(() => {
    if (!user || !allowed) return
    setState('loading')
    fetchStaffTickets({
      search: search || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      requestedPriority: (requestedPriority || undefined) as never,
      itPriority: (itPriority || undefined) as never,
      status: (status || undefined) as never,
      ownerId: owner === 'unassigned' ? 'unassigned' : owner === 'me' ? user.id : undefined,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        setResponse(data)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [
    user,
    allowed,
    search,
    categoryId,
    requestedPriority,
    itPriority,
    status,
    owner,
    sortBy,
    sortDir,
    page,
  ])

  useEffect(load, [load])

  const toggleSort = (field: TicketQueueSortField) => {
    if (field === sortBy) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const clearFilters = () => {
    setSearchInput('')
    setSearch('')
    setCategoryId('')
    setRequestedPriority('')
    setItPriority('')
    setStatus('')
    setOwner('')
    setPage(1)
  }

  const activeFilterChips: { key: string; label: string; clear: () => void }[] = []
  if (categoryId) {
    const name = categories.find((c) => String(c.id) === categoryId)?.name ?? categoryId
    activeFilterChips.push({
      key: 'category',
      label: `Category: ${name}`,
      clear: () => setCategoryId(''),
    })
  }
  if (requestedPriority) {
    activeFilterChips.push({
      key: 'requestedPriority',
      label: `Req. Priority: ${PRIORITY_LABEL[requestedPriority as RequestedPriority]}`,
      clear: () => setRequestedPriority(''),
    })
  }
  if (itPriority) {
    activeFilterChips.push({
      key: 'itPriority',
      label: `IT Priority: ${PRIORITY_LABEL[itPriority as RequestedPriority]}`,
      clear: () => setItPriority(''),
    })
  }
  if (status) {
    activeFilterChips.push({
      key: 'status',
      label: `Status: ${STATUS_LABEL[status as TicketStatus]}`,
      clear: () => setStatus(''),
    })
  }
  if (owner) {
    activeFilterChips.push({
      key: 'owner',
      label: `Owner: ${owner === 'unassigned' ? 'Unassigned' : 'Me'}`,
      clear: () => setOwner(''),
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

  // ui-spec.md §5: a Requester or Administrator reaching this route directly
  // gets a full-page forbidden state, never a silent redirect — the API
  // already returns 403 (BR-40/AC-37), so the client has a real reason to show.
  if (!allowed) {
    return <Forbidden testId="queue-forbidden" homeTo={user ? roleHomePath(user.role) : '/login'} />
  }

  return (
    <div>
      <div className="zg-actions">
        <div>
          <h1 className="zg-title">Ticket Queue</h1>
          <p className="zg-helper">Search, filter, and open any Ticket in the shared queue.</p>
        </div>
        {!isEmptyQueue && !isNoResults && (
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
                  onChange={(e) => setCategoryId(e.target.value)}
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
                  onChange={(e) => setRequestedPriority(e.target.value)}
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
                  onChange={(e) => setItPriority(e.target.value)}
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
                  onChange={(e) => setStatus(e.target.value)}
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
                  value={owner}
                  onChange={(e) => setOwner(e.target.value as OwnerFilter)}
                >
                  <option value="">All Owners</option>
                  <option value="unassigned">Unassigned</option>
                  <option value="me">Assigned to me</option>
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

      {state === 'error' && (
        <div style={{ marginTop: 'var(--zg-space-4)' }}>
          <p className="zg-error" role="alert">
            Unable to load the Ticket Queue. Please try again.
          </p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {isEmptyQueue && (
        <div className="zg-callout" style={{ marginTop: 'var(--zg-space-5)', textAlign: 'center' }}>
          <i className="bi bi-inbox" aria-hidden="true" style={{ fontSize: '32px' }} />
          <p className="zg-title" style={{ fontSize: '18px', marginTop: 'var(--zg-space-3)' }}>
            No tickets exist yet
          </p>
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
                    <td>{formatDate(t.createdAt)}</td>
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
                <div className="zg-actions">
                  <PriorityBadge priority={t.requestedPriority} />
                  <PriorityBadge priority={t.itPriority} />
                  <StatusBadge status={t.currentStatus} />
                </div>
                <p className="zg-helper" style={{ marginTop: 'var(--zg-space-2)' }}>
                  Owner: {t.ownerName ?? 'Unassigned'}
                </p>
                <p className="zg-helper">
                  Created {formatDate(t.createdAt)} · Updated {formatDate(t.updatedAt)}
                </p>
              </Link>
            ))}
          </div>

          <div className="zg-pagination">
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              disabled={response.page <= 1}
              onClick={() => setPage((p) => p - 1)}
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
              onClick={() => setPage((p) => p + 1)}
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
