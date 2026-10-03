import { Link } from 'react-router-dom'

// ui-spec.md §5/§6/§7 (specification.md §12-14): a role reaching a route it
// isn't permitted shows this full-page state, never a silent redirect — the
// API already returns 403, so the client has a real reason to show.
function Forbidden({ testId, homeTo }: { testId: string; homeTo: string }) {
  return (
    <div className="zg-forbidden" data-testid={testId}>
      <i className="bi bi-shield-lock" aria-hidden="true" style={{ fontSize: '32px' }} />
      <p className="zg-title" style={{ fontSize: '18px', marginTop: 'var(--zg-space-3)' }}>
        You don't have access to this page.
      </p>
      <Link
        to={homeTo}
        className="zg-btn zg-btn-secondary"
        style={{ marginTop: 'var(--zg-space-3)' }}
      >
        Back to your home page
      </Link>
    </div>
  )
}

export default Forbidden
