import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from './apiClient'
import { useAuth } from './useAuth'

/** Placeholder only — replaces Lab 2's Development Requester selector so the
 *  app has some way to obtain a session, but is not ui-spec.md §2's Login
 *  screen (no show/hide toggle, no distinct inactive-account banner, no
 *  redirect-to-Change-Password). That full screen, and Change Password
 *  itself, are Issue #9's job. */
function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const user = await login(email, password)
      if (user.mustChangePassword) {
        setError(
          'This account requires a password change before continuing, which this build does not yet support. Use a different seeded account.',
        )
        return
      }
      navigate('/tickets')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="zg-page">
      <h1 className="zg-wordmark" style={{ color: 'var(--zg-primary)' }}>
        TokTickIT
      </h1>

      <div className="zg-card zg-select-screen" style={{ marginTop: 'var(--zg-space-5)' }}>
        <h2 className="zg-title">Sign In</h2>

        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <p className="zg-error" role="alert" style={{ marginTop: 'var(--zg-space-3)' }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: 'var(--zg-space-4)' }}>
            <label className="zg-label" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              className="zg-field"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 'var(--zg-space-4)' }}>
            <label className="zg-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="zg-field"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="zg-actions" style={{ marginTop: 'var(--zg-space-5)' }}>
            <button
              type="submit"
              className="zg-btn zg-btn-primary"
              disabled={submitting || !email || !password}
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login
