import { Link, useParams } from 'react-router-dom'

// Stand-in route only — the real IT Staff Ticket Detail screen (claim/
// reassign, IT Priority, status transitions, Public Comments, Internal
// Notes) is Issue #7's job. This exists so the Queue's row-open action has
// somewhere to land in the meantime (ui-spec.md §5/§6).
function StaffTicketDetailPlaceholder() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="zg-callout" style={{ marginTop: 'var(--zg-space-5)', textAlign: 'center' }}>
      <p className="zg-title" style={{ fontSize: '18px' }}>
        Ticket #{id}
      </p>
      <p className="zg-helper" style={{ marginTop: 'var(--zg-space-2)' }}>
        The full Ticket Detail screen isn't built yet.
      </p>
      <Link
        to="/staff/tickets"
        className="zg-btn zg-btn-secondary"
        style={{ marginTop: 'var(--zg-space-3)' }}
      >
        Back to Ticket Queue
      </Link>
    </div>
  )
}

export default StaffTicketDetailPlaceholder
