import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from './apiClient'
import PasswordField from './PasswordField'
import { roleHomePath } from './lib/role-routes'
import { useAuth } from './useAuth'

type Field = 'email' | 'password'
type FieldErrors = Partial<Record<Field, string>>
type BannerKind = 'invalid' | 'inactive' | 'server'

const BANNER_COPY: Record<BannerKind, string> = {
  invalid: 'Invalid email or password. Please try again.',
  inactive: 'This account is inactive. Contact an Administrator.',
  server: 'Something went wrong. Please try again.',
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!email.trim()) errors.email = 'Email address is required.'
  if (!password) errors.password = 'Password is required.'
  return errors
}

// ui-spec.md §2 (FR-01, BR-01, BR-06, BR-07, AC-01, AC-05, AC-06).
function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [banner, setBanner] = useState<BannerKind | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const liveErrors = validate(email, password)
  const fieldError = (field: Field) => (touched[field] ? liveErrors[field] : undefined)
  const handleBlur = (field: Field) => setTouched((prev) => ({ ...prev, [field]: true }))

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    setBanner(null)
    setTouched({ email: true, password: true })
    if (Object.keys(liveErrors).length > 0) return

    setSubmitting(true)
    try {
      const user = await login(email, password)
      navigate(user.mustChangePassword ? '/change-password' : roleHomePath(user.role))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INACTIVE_ACCOUNT') {
        setBanner('inactive')
      } else if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setBanner('invalid')
      } else {
        setBanner('server')
      }
      // BR-06: never hints which field was wrong — only the password clears.
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
          {banner && (
            <p
              className={banner === 'inactive' ? 'zg-banner-warning' : 'zg-error'}
              role="alert"
              style={{ marginTop: 'var(--zg-space-3)' }}
            >
              {BANNER_COPY[banner]}
            </p>
          )}

          <div style={{ marginTop: 'var(--zg-space-4)' }}>
            <label className="zg-label" htmlFor="login-email">
              Email address <span className="zg-required">*</span>
            </label>
            <input
              id="login-email"
              className={`zg-field${fieldError('email') ? ' zg-field-invalid' : ''}`}
              type="email"
              required
              autoComplete="username"
              value={email}
              aria-invalid={fieldError('email') ? true : undefined}
              aria-describedby={fieldError('email') ? 'login-email-error' : undefined}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => handleBlur('email')}
            />
            {fieldError('email') && (
              <p id="login-email-error" className="zg-error-message" role="alert">
                {fieldError('email')}
              </p>
            )}
          </div>

          <div style={{ marginTop: 'var(--zg-space-4)' }} onBlur={() => handleBlur('password')}>
            <PasswordField
              id="login-password"
              label="Password"
              value={password}
              onChange={setPassword}
              error={fieldError('password')}
              autoComplete="current-password"
            />
          </div>

          <div className="zg-actions" style={{ marginTop: 'var(--zg-space-2)' }}>
            {/* No password-reset email in Lab 3 (specification.md §3 Excluded)
                — shown inert with an explanation rather than silently broken. */}
            <button
              type="button"
              className="zg-btn zg-btn-tertiary"
              disabled
              title="Password resets are performed by an Administrator."
            >
              Forgot your password?
            </button>
          </div>

          <div className="zg-actions" style={{ marginTop: 'var(--zg-space-4)' }}>
            <button
              type="submit"
              className="zg-btn zg-btn-primary"
              disabled={submitting}
              aria-disabled={submitting}
            >
              {submitting && <span className="zg-spinner" aria-hidden="true" />}
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login
