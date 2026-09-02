import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequester, type Requester } from './RequesterContext'

type LoadState = 'loading' | 'ready' | 'error'

function DevRequesterSelection() {
  const [state, setState] = useState<LoadState>('loading')
  const [requesters, setRequesters] = useState<Requester[]>([])
  const [selectedId, setSelectedId] = useState('')
  const { selectRequester } = useRequester()
  const navigate = useNavigate()

  const load = useCallback(() => {
    setState('loading')
    setSelectedId('')
    fetch('/api/dev-requesters')
      .then((res) => {
        if (!res.ok) throw new Error(`Backend responded with ${res.status}`)
        return res.json() as Promise<Requester[]>
      })
      .then((data) => {
        setRequesters(data)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  useEffect(load, [load])

  const chosen = requesters.find((r) => String(r.id) === selectedId)

  const handleContinue = () => {
    if (!chosen) return
    selectRequester(chosen)
    navigate('/tickets')
  }

  return (
    <div className="zg-page">
      <h1 className="zg-wordmark" style={{ color: 'var(--zg-primary)' }}>
        TokTickIT
      </h1>

      <div className="zg-card zg-select-screen" style={{ marginTop: 'var(--zg-space-5)' }}>
        <h2 className="zg-title">
          <span aria-hidden="true">👤 </span>Select Development Requester
        </h2>

        <p className="zg-helper" style={{ marginTop: 'var(--zg-space-2)' }}>
          Select a Development Requester to test requester-specific ticket behavior. This is not a
          login screen. Authentication and role-based access will be introduced in Lab 3.
        </p>

        {state === 'loading' && (
          <p className="zg-skeleton" aria-live="polite" style={{ marginTop: 'var(--zg-space-5)' }}>
            Loading development requesters…
          </p>
        )}

        {state === 'error' && (
          <div style={{ marginTop: 'var(--zg-space-5)' }}>
            <p className="zg-error" role="alert">
              Unable to load development requesters. Please try again.
            </p>
            <button type="button" className="zg-btn zg-btn-secondary" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {state === 'ready' && requesters.length === 0 && (
          <p className="zg-callout" style={{ marginTop: 'var(--zg-space-5)' }}>
            No active development requesters are configured. Please contact course staff — there is
            nothing to select yet.
          </p>
        )}

        {state === 'ready' && requesters.length > 0 && (
          <div style={{ marginTop: 'var(--zg-space-5)' }}>
            <label className="zg-label" htmlFor="dev-requester">
              Development Requester <span className="zg-required">*</span>
            </label>
            <select
              id="dev-requester"
              className="zg-field"
              required
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Choose a development requester…</option>
              {requesters.map((requester) => (
                <option key={requester.id} value={requester.id}>
                  {requester.name} ({requester.email})
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="zg-callout" style={{ marginTop: 'var(--zg-space-4)' }}>
          <span aria-hidden="true">ℹ️ </span>Only active development requesters are shown.
        </p>

        <p className="zg-callout" style={{ marginTop: 'var(--zg-space-3)' }}>
          <span aria-hidden="true">🛡️ </span>Authentication coming in Lab 3 — this selection is for
          testing only and grants no access rights.
        </p>

        <div className="zg-actions" style={{ marginTop: 'var(--zg-space-5)' }}>
          <button
            type="button"
            className="zg-btn zg-btn-secondary"
            onClick={() => setSelectedId('')}
          >
            Cancel
          </button>
          <button
            type="button"
            className="zg-btn zg-btn-primary"
            disabled={!chosen}
            onClick={handleContinue}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export default DevRequesterSelection
