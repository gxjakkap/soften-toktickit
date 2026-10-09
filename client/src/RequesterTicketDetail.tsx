import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AttachmentSection from './AttachmentSection'
import { ApiError, fetchStatusHistory, fetchTicket, markResolved, postComment } from './apiClient'
import { PriorityBadge, RoleBadge, StatusBadge } from './badges'
import Forbidden from './Forbidden'
import StatusHistory from './StatusHistory'
import { roleHomePath } from './lib/role-routes'
import { useAuth } from './useAuth'
import type { StatusHistoryEntry, TicketComment, TicketDetail } from './types'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

const COMMENT_MAX = 2000

function RequesterTicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  // !user: the session hasn't resolved yet — defer judgment rather than
  // flashing Forbidden before the role is even known.
  const allowed = !user || user.role === 'REQUESTER'
  const [state, setState] = useState<LoadState>('loading')
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [comments, setComments] = useState<TicketComment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [resolvedAt, setResolvedAt] = useState<string | null>(null)
  const [confirmingResolve, setConfirmingResolve] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [history, setHistory] = useState<StatusHistoryEntry[] | null>(null)
  const [historyFailed, setHistoryFailed] = useState(false)

  // Lab 4 ui-spec.md §6 (FR-09): the same read-only Status History as staff.
  const loadHistory = useCallback(() => {
    if (!user || !id || !allowed) return
    setHistoryFailed(false)
    fetchStatusHistory(Number(id))
      .then(setHistory)
      .catch(() => setHistoryFailed(true))
  }, [user, id, allowed])

  useEffect(loadHistory, [loadHistory])

  const load = useCallback(() => {
    if (!user || !id || !allowed) return
    setState('loading')
    fetchTicket(Number(id))
      .then((data) => {
        setTicket(data)
        setComments(data.comments)
        setResolvedAt(data.requesterConfirmedResolvedAt)
        setState('ready')
      })
      .catch((err) => {
        // BR-15: a not-owned Ticket looks identical to a nonexistent one, so
        // the UI shows the same safe "not found" message either way.
        if (err instanceof ApiError && err.code === 'NOT_FOUND') {
          setState('not-found')
        } else {
          setState('error')
        }
      })
  }, [user, id, allowed])

  useEffect(load, [load])

  async function handlePostComment() {
    if (!ticket) return
    const content = commentDraft.trim()
    if (!content) return
    setCommentSubmitting(true)
    setCommentError(null)
    try {
      const comment = await postComment(ticket.id, content)
      setComments((prev) => [...prev, comment])
      setCommentDraft('')
    } catch (err) {
      setCommentError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setCommentSubmitting(false)
    }
  }

  async function confirmMarkResolved() {
    if (!ticket) return
    setResolving(true)
    setResolveError(null)
    try {
      const result = await markResolved(ticket.id)
      setResolvedAt(result.requesterConfirmedResolvedAt)
      setConfirmingResolve(false)
    } catch (err) {
      setResolveError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setResolving(false)
    }
  }

  // specification.md §12-14: an IT Staff or Administrator reaching this
  // Requester route directly gets the full-page forbidden state, with no
  // Ticket request made.
  if (!allowed) {
    return (
      <Forbidden
        testId="requester-detail-forbidden"
        homeTo={user ? roleHomePath(user.role) : '/login'}
      />
    )
  }

  return (
    <div>
      <div className="zg-actions" style={{ marginBottom: 'var(--zg-space-4)' }}>
        <p className="zg-helper" style={{ margin: 0 }}>
          My Tickets &gt; Ticket Detail
        </p>
        <Link to="/tickets" className="zg-btn zg-btn-secondary">
          Back to My Tickets
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
          <Link to="/tickets" className="zg-btn zg-btn-secondary">
            Back to My Tickets
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

      {state === 'ready' && ticket && user && (
        <>
          <div className="zg-card">
            {/* ui-spec.md §4: hidden once Closed/Cancelled; never itself
                changes Current Status (BR-24, BR-25). */}
            {ticket.currentStatus !== 'CLOSED' && ticket.currentStatus !== 'CANCELLED' && (
              <div className="zg-actions" style={{ justifyContent: 'flex-start' }}>
                {resolvedAt ? (
                  <span className="zg-badge zg-badge-status-resolved" data-testid="resolved-badge">
                    Marked resolved by you on {new Date(resolvedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="zg-btn zg-btn-secondary"
                      aria-describedby="appears-resolved-hint"
                      onClick={() => {
                        setResolveError(null)
                        setConfirmingResolve(true)
                      }}
                    >
                      Problem Appears Resolved
                    </button>
                    {/* Lab 4 BR-20: a request to IT Staff, never a resolution. */}
                    <span className="zg-helper" id="appears-resolved-hint">
                      Lets IT Staff know it looks fixed. Only IT Staff can resolve the ticket.
                    </span>
                  </>
                )}
              </div>
            )}

            <h1 className="zg-title" style={{ marginTop: 'var(--zg-space-3)' }}>
              {ticket.summary}
            </h1>
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
                  <PriorityBadge priority={ticket.requestedPriority} testId="priority-badge" />
                </p>
              </div>
              <div>
                <span className="zg-label">Current Status</span>
                <p>
                  <StatusBadge status={ticket.currentStatus} testId="status-badge" />
                </p>
              </div>
              <div className="zg-detail-full">
                <span className="zg-label">Description</span>
                <p>{ticket.description}</p>
              </div>
            </div>
          </div>

          <AttachmentSection ticketId={ticket.id} initialAttachments={ticket.attachments} />

          <StatusHistory entries={history} failed={historyFailed} onRetry={loadHistory} />

          <div className="zg-card" style={{ marginTop: 'var(--zg-space-5)' }}>
            <h2 className="zg-section-heading">Public Comments</h2>

            {comments.length === 0 ? (
              <p className="zg-helper" style={{ marginTop: 'var(--zg-space-4)' }}>
                No comments yet.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 'var(--zg-space-4)' }}>
                {comments.map((comment) => (
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
              <label className="zg-label" htmlFor="new-comment">
                Add a comment
              </label>
              <textarea
                id="new-comment"
                className="zg-field"
                rows={3}
                maxLength={COMMENT_MAX}
                value={commentDraft}
                disabled={commentSubmitting}
                aria-disabled={commentSubmitting}
                onChange={(e) => setCommentDraft(e.target.value)}
              />
              {commentDraft.length >= COMMENT_MAX * 0.8 && (
                <p className="zg-helper zg-char-count">
                  {commentDraft.length}/{COMMENT_MAX} characters
                </p>
              )}
              {commentError && (
                <p className="zg-error-message" role="alert">
                  {commentError}
                </p>
              )}
              <div className="zg-actions" style={{ marginTop: 'var(--zg-space-3)' }}>
                <button
                  type="button"
                  className="zg-btn zg-btn-primary"
                  disabled={commentSubmitting || commentDraft.trim().length === 0}
                  aria-disabled={commentSubmitting || commentDraft.trim().length === 0}
                  onClick={handlePostComment}
                >
                  {commentSubmitting ? 'Posting…' : 'Post Comment'}
                </button>
              </div>
            </div>
          </div>

          {confirmingResolve && (
            <>
              <div
                className="modal d-block"
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="resolve-confirm-title"
              >
                <div className="modal-dialog">
                  <div className="modal-content zg-modal-content">
                    <div className="modal-header">
                      <h5 className="zg-modal-title" id="resolve-confirm-title">
                        Problem Appears Resolved
                      </h5>
                      <button
                        type="button"
                        className="btn-close"
                        aria-label="Close"
                        title="Close"
                        onClick={() => setConfirmingResolve(false)}
                      />
                    </div>
                    <div className="modal-body">
                      <p>
                        This tells IT Staff your issue looks fixed — it does not close the Ticket.
                        IT Staff will confirm and formally resolve it.
                      </p>
                      {resolveError && (
                        <p className="zg-error-message" role="alert">
                          {resolveError}
                        </p>
                      )}
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="zg-btn zg-btn-secondary"
                        onClick={() => setConfirmingResolve(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="zg-btn zg-btn-primary"
                        disabled={resolving}
                        aria-disabled={resolving}
                        onClick={confirmMarkResolved}
                      >
                        {resolving ? 'Confirming…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-backdrop show" />
            </>
          )}
        </>
      )}
    </div>
  )
}

export default RequesterTicketDetail
