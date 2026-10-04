import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AttachmentSection from './AttachmentSection'
import {
  ApiError,
  claimTicket,
  fetchActiveItStaff,
  fetchStaffTicket,
  postStaffComment,
  reassignTicket,
  updateItPriority,
  updateTicketStatus,
} from './apiClient'
import { PriorityBadge, RoleBadge, StatusBadge } from './badges'
import Forbidden from './Forbidden'
import { permittedTransitions } from './lib/ticket-status'
import { roleHomePath } from './lib/role-routes'
import { useAuth } from './useAuth'
import type {
  ActiveStaffUser,
  RequestedPriority,
  StaffTicketDetail as StaffTicketDetailData,
  TicketStatus,
} from './types'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

const COMMENT_MAX = 2000

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

const PRIORITY_OPTIONS: RequestedPriority[] = ['LOW', 'MEDIUM', 'HIGH']

function StaffTicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const allowed = user?.role === 'IT_STAFF'

  const [state, setState] = useState<LoadState>('loading')
  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null)
  const [itStaff, setItStaff] = useState<ActiveStaffUser[]>([])

  const [ownerId, setOwnerId] = useState<number | null>(null)
  const [ownerBusy, setOwnerBusy] = useState(false)
  const [ownerError, setOwnerError] = useState<string | null>(null)

  const [itPriority, setItPriority] = useState<RequestedPriority>('LOW')
  const [priorityBusy, setPriorityBusy] = useState(false)
  const [priorityError, setPriorityError] = useState<string | null>(null)

  const [currentStatus, setCurrentStatus] = useState<TicketStatus>('NEW')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [publicDraft, setPublicDraft] = useState('')
  const [publicSubmitting, setPublicSubmitting] = useState(false)
  const [publicError, setPublicError] = useState<string | null>(null)

  const [noteDraft, setNoteDraft] = useState('')
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!allowed || !id) return
    setState('loading')
    fetchStaffTicket(Number(id))
      .then((data) => {
        setTicket(data)
        setOwnerId(data.ownerId)
        setItPriority(data.itPriority)
        setCurrentStatus(data.currentStatus)
        setState('ready')
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NOT_FOUND') {
          setState('not-found')
        } else {
          setState('error')
        }
      })
  }, [allowed, id])

  useEffect(load, [load])

  useEffect(() => {
    if (!allowed) return
    fetchActiveItStaff()
      .then(setItStaff)
      .catch(() => setItStaff([]))
  }, [allowed])

  async function handleClaim() {
    if (!ticket) return
    setOwnerBusy(true)
    setOwnerError(null)
    try {
      const result = await claimTicket(ticket.id)
      setOwnerId(result.ownerId)
    } catch (err) {
      setOwnerError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setOwnerBusy(false)
    }
  }

  async function handleReassign(nextOwnerId: number | null) {
    if (!ticket) return
    const previous = ownerId
    setOwnerId(nextOwnerId)
    setOwnerBusy(true)
    setOwnerError(null)
    try {
      const result = await reassignTicket(ticket.id, nextOwnerId)
      setOwnerId(result.ownerId)
    } catch (err) {
      setOwnerId(previous)
      setOwnerError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setOwnerBusy(false)
    }
  }

  async function handlePriorityChange(next: RequestedPriority) {
    if (!ticket) return
    const previous = itPriority
    setItPriority(next)
    setPriorityBusy(true)
    setPriorityError(null)
    try {
      await updateItPriority(ticket.id, next)
    } catch (err) {
      setItPriority(previous)
      setPriorityError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setPriorityBusy(false)
    }
  }

  async function handleStatusChange(next: TicketStatus) {
    if (!ticket || next === currentStatus) return
    const previous = currentStatus
    setCurrentStatus(next)
    setStatusBusy(true)
    setStatusError(null)
    try {
      const result = await updateTicketStatus(ticket.id, next)
      setCurrentStatus(result.currentStatus)
    } catch (err) {
      setCurrentStatus(previous)
      setStatusError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setStatusBusy(false)
    }
  }

  async function handlePostPublic() {
    if (!ticket) return
    const content = publicDraft.trim()
    if (!content) return
    setPublicSubmitting(true)
    setPublicError(null)
    try {
      const comment = await postStaffComment(ticket.id, 'PUBLIC', content)
      setTicket((prev) => (prev ? { ...prev, comments: [...prev.comments, comment] } : prev))
      setPublicDraft('')
    } catch (err) {
      setPublicError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setPublicSubmitting(false)
    }
  }

  async function handlePostNote() {
    if (!ticket) return
    const content = noteDraft.trim()
    if (!content) return
    setNoteSubmitting(true)
    setNoteError(null)
    try {
      const note = await postStaffComment(ticket.id, 'INTERNAL', content)
      setTicket((prev) => (prev ? { ...prev, comments: [...prev.comments, note] } : prev))
      setNoteDraft('')
    } catch (err) {
      setNoteError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setNoteSubmitting(false)
    }
  }

  // ui-spec.md §6: this screen and its route are IT Staff only — an
  // Administrator's read-only API access (BR-40) has no UI entry point.
  if (!allowed) {
    return (
      <Forbidden testId="detail-forbidden" homeTo={user ? roleHomePath(user.role) : '/login'} />
    )
  }

  const publicComments = ticket?.comments.filter((c) => c.visibility === 'PUBLIC') ?? []
  const internalNotes = ticket?.comments.filter((c) => c.visibility === 'INTERNAL') ?? []
  const canClaim = ticket !== null && user !== null && (ownerId === null || ownerId === user.id)
  const statusOptions = [currentStatus, ...permittedTransitions(currentStatus)]

  return (
    <div>
      <div className="zg-actions" style={{ marginBottom: 'var(--zg-space-4)' }}>
        <p className="zg-helper" style={{ margin: 0 }}>
          Ticket Queue &gt; Ticket Detail
        </p>
        <Link to="/staff/tickets" className="zg-btn zg-btn-secondary">
          Back to Ticket Queue
        </Link>
      </div>

      {state === 'loading' && (
        <p className="zg-skeleton" aria-live="polite">
          Loading ticket details…
        </p>
      )}

      {state === 'not-found' && (
        <div className="zg-card">
          <p>Ticket not found.</p>
          <Link to="/staff/tickets" className="zg-btn zg-btn-secondary">
            Back to Ticket Queue
          </Link>
        </div>
      )}

      {state === 'error' && (
        <div>
          <p className="zg-error" role="alert">
            Unable to load this ticket. Please try again.
          </p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && ticket && (
        <>
          <div className="zg-card">
            <h1 className="zg-title">{ticket.summary}</h1>
            <div className="zg-detail-grid" style={{ marginTop: 'var(--zg-space-4)' }}>
              <div>
                <span className="zg-label">Ticket No.</span>
                <p>{ticket.ticketNumber}</p>
              </div>
              <div>
                <span className="zg-label">Ticket Date</span>
                <p>{new Date(ticket.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <span className="zg-label">Category</span>
                <p>{ticket.category.name}</p>
              </div>
              <div>
                <span className="zg-label">Related System</span>
                <p>{ticket.relatedSystem.name}</p>
              </div>
              <div>
                <span className="zg-label">Requester</span>
                <p>{ticket.requester.name}</p>
              </div>
              <div>
                <span className="zg-label">Requested Priority</span>
                <p>
                  <PriorityBadge
                    priority={ticket.requestedPriority}
                    testId="requested-priority-badge"
                  />
                </p>
              </div>
              <div className="zg-detail-full">
                <span className="zg-label">Description</span>
                <p>{ticket.description}</p>
              </div>
            </div>
          </div>

          <div className="zg-card" style={{ marginTop: 'var(--zg-space-4)' }}>
            <h2 className="zg-section-heading">Ownership, Priority &amp; Status</h2>
            <div className="zg-detail-grid" style={{ marginTop: 'var(--zg-space-4)' }}>
              <div>
                <span className="zg-label" id="ticket-owner-label">
                  Ticket Owner
                </span>
                <select
                  aria-labelledby="ticket-owner-label"
                  className="zg-field"
                  value={ownerId ?? ''}
                  disabled={ownerBusy}
                  aria-disabled={ownerBusy}
                  onChange={(e) =>
                    handleReassign(e.target.value === '' ? null : Number(e.target.value))
                  }
                >
                  <option value="">Unassigned</option>
                  {itStaff.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
                {canClaim && (
                  <button
                    type="button"
                    className="zg-btn zg-btn-secondary"
                    style={{ marginTop: 'var(--zg-space-2)' }}
                    disabled={ownerBusy}
                    aria-disabled={ownerBusy}
                    onClick={handleClaim}
                  >
                    Claim
                  </button>
                )}
                {ownerError && (
                  <p className="zg-error-message" role="alert">
                    {ownerError}
                  </p>
                )}
              </div>

              <div>
                <span className="zg-label" id="it-priority-label">
                  IT Priority
                </span>
                <select
                  aria-labelledby="it-priority-label"
                  className="zg-field"
                  value={itPriority}
                  disabled={priorityBusy}
                  aria-disabled={priorityBusy}
                  onChange={(e) => handlePriorityChange(e.target.value as RequestedPriority)}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p === 'LOW' ? 'Low' : p === 'MEDIUM' ? 'Medium' : 'High'}
                    </option>
                  ))}
                </select>
                {priorityError && (
                  <p className="zg-error-message" role="alert">
                    {priorityError}
                  </p>
                )}
              </div>

              <div>
                <span className="zg-label" id="current-status-label">
                  Current Status
                </span>
                <select
                  aria-labelledby="current-status-label"
                  className="zg-field"
                  value={currentStatus}
                  disabled={statusBusy}
                  aria-disabled={statusBusy}
                  onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                {ticket.requesterConfirmedResolvedAt && (
                  <p className="zg-helper" style={{ marginTop: 'var(--zg-space-1)' }}>
                    Requester confirms resolved ·{' '}
                    {new Date(ticket.requesterConfirmedResolvedAt).toLocaleDateString()}
                  </p>
                )}
                {statusError && (
                  <p className="zg-error-message" role="alert">
                    {statusError}
                  </p>
                )}
              </div>

              <div>
                <span className="zg-label">Status Badge</span>
                <p>
                  <StatusBadge status={currentStatus} testId="status-badge" />
                </p>
              </div>
            </div>
          </div>

          <AttachmentSection
            ticketId={ticket.id}
            initialAttachments={ticket.attachments}
            readOnly
          />

          <div className="zg-card" style={{ marginTop: 'var(--zg-space-5)' }}>
            <h2 className="zg-section-heading">Public Comments</h2>

            {publicComments.length === 0 ? (
              <p className="zg-helper" style={{ marginTop: 'var(--zg-space-4)' }}>
                No comments yet.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 'var(--zg-space-4)' }}>
                {publicComments.map((comment) => (
                  <li key={comment.id} style={{ marginBottom: 'var(--zg-space-4)' }}>
                    <div className="zg-actions" style={{ justifyContent: 'flex-start' }}>
                      <strong>{comment.authorName}</strong>
                      <RoleBadge role={comment.authorRole} />
                      <span className="zg-helper">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ marginTop: 'var(--zg-space-1)' }}>{comment.content}</p>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: 'var(--zg-space-4)' }}>
              <label className="zg-label" htmlFor="new-public-comment">
                Add a comment
              </label>
              <textarea
                id="new-public-comment"
                className="zg-field"
                rows={3}
                maxLength={COMMENT_MAX}
                value={publicDraft}
                disabled={publicSubmitting}
                aria-disabled={publicSubmitting}
                onChange={(e) => setPublicDraft(e.target.value)}
              />
              {publicDraft.length >= COMMENT_MAX * 0.8 && (
                <p className="zg-helper zg-char-count">
                  {publicDraft.length}/{COMMENT_MAX} characters
                </p>
              )}
              {publicError && (
                <p className="zg-error-message" role="alert">
                  {publicError}
                </p>
              )}
              <div className="zg-actions" style={{ marginTop: 'var(--zg-space-3)' }}>
                <button
                  type="button"
                  className="zg-btn zg-btn-primary"
                  disabled={publicSubmitting || publicDraft.trim().length === 0}
                  aria-disabled={publicSubmitting || publicDraft.trim().length === 0}
                  onClick={handlePostPublic}
                >
                  {publicSubmitting ? 'Posting…' : 'Post Comment'}
                </button>
              </div>
            </div>
          </div>

          <div
            className="zg-internal-notes"
            style={{ marginTop: 'var(--zg-space-5)' }}
            data-testid="internal-notes-section"
          >
            <h2 className="zg-section-heading">Internal Notes</h2>
            <p className="zg-internal-notes-label">Internal only — not visible to the Requester</p>

            {internalNotes.length === 0 ? (
              <p className="zg-helper" style={{ marginTop: 'var(--zg-space-4)' }}>
                No internal notes yet.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 'var(--zg-space-4)' }}>
                {internalNotes.map((note) => (
                  <li key={note.id} style={{ marginBottom: 'var(--zg-space-4)' }}>
                    <div className="zg-actions" style={{ justifyContent: 'flex-start' }}>
                      <strong>{note.authorName}</strong>
                      <RoleBadge role={note.authorRole} />
                      <span className="zg-helper">{new Date(note.createdAt).toLocaleString()}</span>
                    </div>
                    <p style={{ marginTop: 'var(--zg-space-1)' }}>{note.content}</p>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: 'var(--zg-space-4)' }}>
              <label className="zg-label" htmlFor="new-internal-note">
                Add an internal note
              </label>
              <textarea
                id="new-internal-note"
                className="zg-field"
                rows={3}
                maxLength={COMMENT_MAX}
                value={noteDraft}
                disabled={noteSubmitting}
                aria-disabled={noteSubmitting}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              {noteDraft.length >= COMMENT_MAX * 0.8 && (
                <p className="zg-helper zg-char-count">
                  {noteDraft.length}/{COMMENT_MAX} characters
                </p>
              )}
              {noteError && (
                <p className="zg-error-message" role="alert">
                  {noteError}
                </p>
              )}
              <div className="zg-actions" style={{ marginTop: 'var(--zg-space-3)' }}>
                <button
                  type="button"
                  className="zg-btn zg-btn-primary"
                  disabled={noteSubmitting || noteDraft.trim().length === 0}
                  aria-disabled={noteSubmitting || noteDraft.trim().length === 0}
                  onClick={handlePostNote}
                >
                  {noteSubmitting ? 'Posting…' : 'Post Internal Note'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default StaffTicketDetail
