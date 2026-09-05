import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchCategories, fetchTickets } from './apiClient'
import { useRequester } from './RequesterContext'
import type { Category, SortDirection, TicketListResponse, TicketSortField, TicketStatus } from './types'

type LoadState = 'loading' | 'ready' | 'error'

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 300

const STATUS_OPTIONS: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED', 'CANCELLED']

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}

// ui-spec.md §9: Pending/In Progress and Cancelled/Closed share a badge
// colour, so each pair also carries a distinct icon (never colour alone).
const STATUS_ICON: Partial<Record<TicketStatus, string>> = {
  PENDING: 'bi-hourglass-split',
  IN_PROGRESS: 'bi-arrow-repeat',
  CANCELLED: 'bi-x-circle',
  CLOSED: 'bi-check2-circle',
}

const STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  NEW: 'zg-badge-status-new',
  OPEN: 'zg-badge-status-open',
  IN_PROGRESS: 'zg-badge-status-in-progress',
  PENDING: 'zg-badge-status-pending',
  RESOLVED: 'zg-badge-status-resolved',
  CLOSED: 'zg-badge-status-closed',
  CANCELLED: 'zg-badge-status-cancelled',
}

const PRIORITY_BADGE_CLASS = {
  LOW: 'zg-badge-priority-low',
  MEDIUM: 'zg-badge-priority-medium',
  HIGH: 'zg-badge-priority-high',
} as const

// ui-spec.md §11.3: only these columns are sortable (BR-18); Category and
// Last Updated are display-only.
const SORTABLE_COLUMNS: { field: TicketSortField; label: string }[] = [
  { field: 'ticketNumber', label: 'Ticket No.' },
  { field: 'createdAt', label: 'Created Date' },
  { field: 'summary', label: 'Summary' },
  { field: 'requestedPriority', label: 'Requested Priority' },
  { field: 'currentStatus', label: 'Current Status' },
]

function StatusBadge({ status }: { status: TicketStatus }) {
  const icon = STATUS_ICON[status]
  return (
    <span className={`zg-badge ${STATUS_BADGE_CLASS[status]}`}>
      {icon && <i className={`bi ${icon}`} aria-hidden="true" />}
      {STATUS_LABEL[status]}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: keyof typeof PRIORITY_BADGE_CLASS }) {
  const label = priority.charAt(0) + priority.slice(1).toLowerCase()
  return <span className={`zg-badge ${PRIORITY_BADGE_CLASS[priority]}`}>{label}</span>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function MyTickets() {
  const { requester } = useRequester()
  const navigate = useNavigate()

  const [state, setState] = useState<LoadState>('loading')
  const [response, setResponse] = useState<TicketListResponse | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [requestedPriority, setRequestedPriority] = useState('')
  const [status, setStatus] = useState('')
  const [sortBy, setSortBy] = useState<TicketSortField>('createdAt')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  // AC-16: the list narrows as the Requester types, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [search, categoryId, requestedPriority, status])

  const load = useCallback(() => {
    if (!requester) return
    setState('loading')
    fetchTickets(requester.id, {
      search: search || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      requestedPriority: (requestedPriority || undefined) as never,
      status: (status || undefined) as never,
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
  }, [requester, search, categoryId, requestedPriority, status, sortBy, sortDir, page])

  useEffect(load, [load])

  const toggleSort = (field: TicketSortField) => {
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
    setStatus('')
    setPage(1)
  }

  const openTicket = (id: number) => navigate(`/tickets/${id}`)

  const isEmptyAccount = state === 'ready' && response?.hasAnyTickets === false
  const isNoResults = state === 'ready' && response !== null && response.hasAnyTickets && response.totalCount === 0
  const hasRows = state === 'ready' && response !== null && response.data.length > 0

  const rangeStart = response && response.totalCount > 0 ? (response.page - 1) * response.pageSize + 1 : 0
  const rangeEnd = response ? Math.min(response.page * response.pageSize, response.totalCount) : 0

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
          <div className="zg-filter-field">
            <label className="zg-label" htmlFor="my-tickets-priority">
              Requested Priority
            </label>
            <select
              id="my-tickets-priority"
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
          <div className="zg-filter-field">
            <label className="zg-label" htmlFor="my-tickets-status">
              Current Status
            </label>
            <select
              id="my-tickets-status"
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
            Unable to load your tickets. Please try again.
          </p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {isEmptyAccount && (
        <div className="zg-callout" style={{ marginTop: 'var(--zg-space-5)', textAlign: 'center' }}>
          <i className="bi bi-inbox" aria-hidden="true" style={{ fontSize: '32px' }} />
          <p className="zg-title" style={{ fontSize: '18px', marginTop: 'var(--zg-space-3)' }}>
            You haven't created any tickets yet
          </p>
          <Link to="/tickets/new" className="zg-btn zg-btn-primary" style={{ marginTop: 'var(--zg-space-3)' }}>
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
          <div className="zg-table-wrap" data-testid="tickets-table" style={{ marginTop: 'var(--zg-space-4)' }}>
            <table className="zg-table">
              <thead>
                <tr>
                  {SORTABLE_COLUMNS.map(({ field, label }) => (
                    <th key={field}>
                      <button type="button" className="zg-sort-btn" onClick={() => toggleSort(field)}>
                        {label}
                        {sortBy === field && (
                          <i className={`bi ${sortDir === 'asc' ? 'bi-caret-up-fill' : 'bi-caret-down-fill'}`} aria-hidden="true" />
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
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{t.summary}</td>
                    <td>
                      <PriorityBadge priority={t.requestedPriority} />
                    </td>
                    <td>
                      <StatusBadge status={t.currentStatus} />
                    </td>
                    <td>{t.categoryName}</td>
                    <td>{formatDate(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="zg-ticket-cards" data-testid="tickets-cards" style={{ marginTop: 'var(--zg-space-4)' }}>
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

export default MyTickets
