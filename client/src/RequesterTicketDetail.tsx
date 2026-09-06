import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AttachmentSection from './AttachmentSection'
import { ApiError, fetchTicket } from './apiClient'
import { PriorityBadge, StatusBadge } from './badges'
import { useRequester } from './RequesterContext'
import type { TicketDetail } from './types'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

function RequesterTicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { requester } = useRequester()
  const [state, setState] = useState<LoadState>('loading')
  const [ticket, setTicket] = useState<TicketDetail | null>(null)

  const load = useCallback(() => {
    if (!requester || !id) return
    setState('loading')
    fetchTicket(requester.id, Number(id))
      .then((data) => {
        setTicket(data)
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
  }, [requester, id])

  useEffect(load, [load])

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

      {state === 'ready' && ticket && requester && (
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

          <AttachmentSection requesterId={requester.id} ticketId={ticket.id} initialAttachments={ticket.attachments} />
        </>
      )}
    </div>
  )
}

export default RequesterTicketDetail
