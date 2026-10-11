import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ActionsTaken from './ActionsTaken'
import AttachmentSection from './AttachmentSection'
import {
  ApiError,
  claimTicket,
  fetchActiveItStaff,
  fetchStaffStatusHistory,
  fetchStaffTicket,
  postStaffComment,
  reassignTicket,
  updateItPriority,
  updateTicketStatus,
} from './apiClient'
import { PriorityBadge, RoleBadge, StatusBadge } from './badges'
import Forbidden from './Forbidden'
import StatusHistory from './StatusHistory'
import { formatDateTime } from './lib/datetime'
import { permittedTransitions } from './lib/ticket-status'
import { roleHomePath } from './lib/role-routes'
import { useAuth } from './useAuth'
import type {
  ActiveStaffUser,
  RequestedPriority,
  ResolutionBlockReason,
  StaffTicketDetail as StaffTicketDetailData,
  StatusHistoryEntry,
  TicketStatus,
  TicketWorkflowState,
} from './types'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'
type WorkflowControl = 'owner' | 'priority' | 'status'

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

const PRIORITY_LABEL: Record<RequestedPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

const PRIORITY_OPTIONS: RequestedPriority[] = ['LOW', 'MEDIUM', 'HIGH']

// Lab 4 ui-spec.md §5.1: each failed gate condition in plain words.
const GATE_REASON_TEXT: Record<ResolutionBlockReason, string> = {
  NO_DONE_ACTION: 'Record at least one action as Done.',
  OPEN_ACTIONS: 'Finish or cancel every Planned or In Progress action.',
  PENDING_FOLLOW_UPS: 'Clear every pending follow-up.',
}

const FALLBACK_ERROR = 'Something went wrong. Please try again.'

function StaffTicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  // Lab 4 BR-29: the Administrator gets the same screen and controls.
  const allowed = user?.role === 'IT_STAFF' || user?.role === 'ADMINISTRATOR'

  const [state, setState] = useState<LoadState>('loading')
  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null)
  const [itStaff, setItStaff] = useState<ActiveStaffUser[]>([])
  const [history, setHistory] = useState<StatusHistoryEntry[] | null>(null)
  const [historyFailed, setHistoryFailed] = useState(false)

  // Lab 4 ui-spec.md §2.2-2.3: one workflow write at a time, so every
  // control sends the version the previous write returned.
  const [busy, setBusy] = useState<WorkflowControl | null>(null)
  const [workflowError, setWorkflowError] = useState<{
    control: WorkflowControl
    message: string
  } | null>(null)
  const [conflict, setConflict] = useState<TicketWorkflowState | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const [publicDraft, setPublicDraft] = useState('')
  const [publicSubmitting, setPublicSubmitting] = useState(false)
  const [publicError, setPublicError] = useState<string | null>(null)

  const [noteDraft, setNoteDraft] = useState('')
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const loadHistory = useCallback(() => {
    if (!allowed || !id) return
    setHistoryFailed(false)
    fetchStaffStatusHistory(Number(id))
      .then(setHistory)
      .catch(() => setHistoryFailed(true))
  }, [allowed, id])

  const load = useCallback(() => {
    if (!allowed || !id) return
    setState('loading')
    setConflict(null)
    setWorkflowError(null)
    fetchStaffTicket(Number(id))
      .then((data) => {
        setTicket(data)
        setState('ready')
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NOT_FOUND') {
          setState('not-found')
        } else {
          setState('error')
        }
      })
    loadHistory()
  }, [allowed, id, loadHistory])

  useEffect(load, [load])

  // Lab 4 ui-spec.md §5.2 (AC-27): an Action save can change the resolution
  // gate, so the Ticket is refetched quietly, without the loading state, and
  // the status options follow. A failure keeps the last gate; the status
  // endpoint re-checks it anyway (BR-19).
  const refreshTicket = useCallback(() => {
    if (!id) return
    fetchStaffTicket(Number(id))
      .then(setTicket)
      .catch(() => {})
  }, [id])

  useEffect(() => {
    if (!allowed) return
    fetchActiveItStaff()
      .then(setItStaff)
      .catch(() => setItStaff([]))
  }, [allowed])

  // Lab 4 ui-spec.md §5.1: a successful write's TicketWorkflowState updates
  // the header badge, the controls, and the version in place, no reload.
  // Selects are controlled by the saved values, so a failed write leaves
  // them on the last saved value instead of a stuck optimistic one.
  async function runWorkflowWrite(
    control: WorkflowControl,
    write: (version: number) => Promise<TicketWorkflowState>,
    success: string,
  ) {
    if (!ticket || busy) return
    setBusy(control)
    setWorkflowError(null)
    setConflict(null)
    try {
      const next = await write(ticket.version)
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              version: next.version,
              currentStatus: next.currentStatus,
              resolvedAt: next.resolvedAt,
              ownerId: next.ownerId,
              ownerName: next.ownerName,
              itPriority: next.itPriority,
              updatedAt: next.updatedAt,
            }
          : prev,
      )
      // Failures are announced by their own role="alert" message.
      setAnnouncement(success)
      if (control === 'status') loadHistory()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_UPDATE' && err.details?.current) {
        setConflict(err.details.current as TicketWorkflowState)
      } else if (err instanceof ApiError && err.code === 'RESOLUTION_BLOCKED') {
        // Lab 4 ui-spec.md §5.1: an Action changed elsewhere since load, so
        // the callout switches to the server's reasons.
        const reasons = (err.details?.reasons ?? []) as ResolutionBlockReason[]
        setTicket((prev) =>
          prev ? { ...prev, resolutionGate: { canResolve: false, reasons } } : prev,
        )
        setWorkflowError({ control, message: err.message })
      } else {
        setWorkflowError({
          control,
          message: err instanceof ApiError ? err.message : FALLBACK_ERROR,
        })
      }
    } finally {
      setBusy(null)
    }
  }

  const handleClaim = () =>
    runWorkflowWrite('owner', (v) => claimTicket(ticket!.id, v), 'Ticket claimed.')

  const handleReassign = (nextOwnerId: number | null) =>
    runWorkflowWrite(
      'owner',
      (v) => reassignTicket(ticket!.id, nextOwnerId, v),
      'Ticket Owner updated.',
    )

  const handlePriorityChange = (next: RequestedPriority) =>
    runWorkflowWrite(
      'priority',
      (v) => updateItPriority(ticket!.id, next, v),
      `IT Priority changed to ${PRIORITY_LABEL[next]}.`,
    )

  const handleStatusChange = (next: TicketStatus) => {
    if (!ticket || next === ticket.currentStatus) return
    return runWorkflowWrite(
      'status',
      (v) => updateTicketStatus(ticket.id, next, v),
      `Status changed to ${STATUS_LABEL[next]}.`,
    )
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

  // ui-spec.md §6; Lab 4 BR-29: IT Staff and Administrators only.
  if (!allowed) {
    return (
      <Forbidden testId="detail-forbidden" homeTo={user ? roleHomePath(user.role) : '/login'} />
    )
  }

  const publicComments = ticket?.comments.filter((c) => c.visibility === 'PUBLIC') ?? []
  const internalNotes = ticket?.comments.filter((c) => c.visibility === 'INTERNAL') ?? []
  const canClaim =
    ticket !== null && user !== null && (ticket.ownerId === null || ticket.ownerId === user.id)
  const statusOptions = ticket
    ? [ticket.currentStatus, ...permittedTransitions(ticket.currentStatus)]
    : []
  // Lab 4 ui-spec.md §5.1: Resolved stays offered but disabled while the
  // gate fails; the server still re-checks it (BR-19).
  const resolveBlocked =
    ticket !== null && statusOptions.includes('RESOLVED') && !ticket.resolutionGate.canResolve
  const workflowLocked = busy !== null
  const errorFor = (control: WorkflowControl) =>
    workflowError?.control === control ? workflowError.message : null

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

          <section
            className="zg-card"
            style={{ marginTop: 'var(--zg-space-4)' }}
            aria-labelledby="workflow-heading"
            aria-busy={workflowLocked}
          >
            <h2 className="zg-section-heading" id="workflow-heading">
              Ownership, Priority &amp; Status
            </h2>

            {/* Lab 4 ui-spec.md §2.2 (BR-26): the selects already show the
                last saved values; Reload latest fetches the newer copy. */}
            {conflict !== null && (
              <div
                className="zg-banner-warning"
                role="alert"
                style={{ marginTop: 'var(--zg-space-4)' }}
                data-testid="workflow-conflict"
              >
                <p style={{ margin: 0, fontWeight: 600 }}>
                  Someone else changed this ticket while you were editing.
                </p>
                <p style={{ margin: 'var(--zg-space-1) 0 var(--zg-space-2)' }}>
                  Latest values: status {STATUS_LABEL[conflict.currentStatus]}, owner{' '}
                  {conflict.ownerName ?? 'Unassigned'}, IT Priority{' '}
                  {PRIORITY_LABEL[conflict.itPriority]}.
                </p>
                <button type="button" className="zg-btn zg-btn-secondary" onClick={load}>
                  Reload latest
                </button>
              </div>
            )}

            <div className="zg-detail-grid" style={{ marginTop: 'var(--zg-space-4)' }}>
              <div>
                <span className="zg-label" id="ticket-owner-label">
                  Ticket Owner
                </span>
                <select
                  aria-labelledby="ticket-owner-label"
                  className="zg-field"
                  value={ticket.ownerId ?? ''}
                  disabled={workflowLocked}
                  aria-disabled={workflowLocked}
                  onChange={(e) =>
                    handleReassign(e.target.value === '' ? null : Number(e.target.value))
                  }
                >
                  <option value="">Unassigned</option>
                  {itStaff.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {/* Lab 4 ui-spec.md §5.1: Administrators carry a role suffix. */}
                      {staff.role === 'ADMINISTRATOR'
                        ? `${staff.name} · Administrator`
                        : staff.name}
                    </option>
                  ))}
                </select>
                {canClaim && (
                  <button
                    type="button"
                    className="zg-btn zg-btn-secondary"
                    style={{ marginTop: 'var(--zg-space-2)' }}
                    disabled={workflowLocked}
                    aria-disabled={workflowLocked}
                    aria-busy={busy === 'owner'}
                    onClick={handleClaim}
                  >
                    {busy === 'owner' ? 'Saving…' : 'Claim'}
                  </button>
                )}
                {errorFor('owner') && (
                  <p className="zg-error-message" role="alert">
                    {errorFor('owner')}
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
                  value={ticket.itPriority}
                  disabled={workflowLocked}
                  aria-disabled={workflowLocked}
                  onChange={(e) => handlePriorityChange(e.target.value as RequestedPriority)}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
                {errorFor('priority') && (
                  <p className="zg-error-message" role="alert">
                    {errorFor('priority')}
                  </p>
                )}
              </div>

              <div>
                <span className="zg-label" id="current-status-label">
                  Current Status
                </span>
                <select
                  aria-labelledby="current-status-label"
                  aria-describedby={resolveBlocked ? 'resolution-gate-callout' : undefined}
                  className="zg-field"
                  value={ticket.currentStatus}
                  disabled={workflowLocked}
                  aria-disabled={workflowLocked}
                  onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                >
                  {statusOptions.map((s) =>
                    s === 'RESOLVED' && resolveBlocked ? (
                      <option key={s} value={s} disabled>
                        Resolved (blocked)
                      </option>
                    ) : (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ),
                  )}
                </select>
                {busy === 'status' && (
                  <p className="zg-helper" style={{ marginTop: 'var(--zg-space-1)' }}>
                    Saving status…
                  </p>
                )}
                {resolveBlocked && (
                  <div
                    className="zg-callout"
                    id="resolution-gate-callout"
                    style={{ marginTop: 'var(--zg-space-2)' }}
                    data-testid="resolution-gate-callout"
                  >
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      <i className="bi bi-lock" aria-hidden="true" /> Resolved is blocked until:
                    </p>
                    <ul className="zg-gate-reasons">
                      {ticket.resolutionGate.reasons.map((r) => (
                        <li key={r}>
                          <a href="#actions-taken">{GATE_REASON_TEXT[r]}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Lab 3 ui-spec §6 / Lab 4 BR-20: informational only; it
                    never enables Resolved. */}
                {ticket.requesterConfirmedResolvedAt && (
                  <p className="zg-helper" style={{ marginTop: 'var(--zg-space-1)' }}>
                    Requester confirms resolved ·{' '}
                    <time dateTime={ticket.requesterConfirmedResolvedAt}>
                      {formatDateTime(ticket.requesterConfirmedResolvedAt)}
                    </time>
                  </p>
                )}
                {errorFor('status') && (
                  <p className="zg-error-message" role="alert">
                    {errorFor('status')}
                  </p>
                )}
              </div>

              <div>
                <span className="zg-label">Status Badge</span>
                <p>
                  <StatusBadge status={ticket.currentStatus} testId="status-badge" />
                </p>
              </div>
            </div>
          </section>

          {user && (
            <ActionsTaken
              ticketId={ticket.id}
              ticketStatus={ticket.currentStatus}
              staff={{
                currentUser: user,
                itStaff,
                onActionsChanged: refreshTicket,
                onAnnounce: setAnnouncement,
              }}
            />
          )}

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

          <StatusHistory entries={history} failed={historyFailed} onRetry={loadHistory} />
        </>
      )}

      {/* Lab 4 ui-spec.md §9: one polite live region per Ticket Detail. */}
      <p className="zg-visually-hidden" aria-live="polite" data-testid="workflow-announcement">
        {announcement}
      </p>
    </div>
  )
}

export default StaffTicketDetail
