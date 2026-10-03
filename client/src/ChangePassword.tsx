import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from './apiClient'
import { isStrongPassword } from './lib/password-rules'
import { roleHomePath } from './lib/role-routes'
import PasswordChecklist from './PasswordChecklist'
import PasswordField from './PasswordField'
import { useAuth } from './useAuth'

// ui-spec.md §3 (FR-02, BR-02, BR-10, BR-11, AC-02): the mandatory
// first-login password change. No Cancel/Back — a user who must change
// their password cannot use the application until they do.
function ChangePassword() {
  const { user, changePassword } = useAuth()
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentError, setCurrentError] = useState<string | null>(null)
  const [weakError, setWeakError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const sameAsCurrent =
    newPassword.length > 0 && currentPassword.length > 0 && newPassword === currentPassword
  const newPasswordError = sameAsCurrent
    ? 'New password must be different from the current password.'
    : weakError
  const confirmError =
    confirmPassword.length > 0 && confirmPassword !== newPassword ? 'Passwords do not match.' : null

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    isStrongPassword(newPassword) &&
    !sameAsCurrent &&
    confirmPassword === newPassword

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setCurrentError(null)
    setWeakError(null)
    try {
      const updated = await changePassword(currentPassword, newPassword)
      navigate(roleHomePath(updated.role), { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setCurrentError('Current password is incorrect.')
      } else if (err instanceof ApiError && err.code === 'WEAK_PASSWORD') {
        setWeakError(err.message)
      } else {
        setWeakError(
          err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
        )
      }
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
        <h2 className="zg-title">Change Your Password</h2>
        <p className="zg-helper">
          {user?.name ? `${user.name}, ` : ''}you must set a new password before continuing.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginTop: 'var(--zg-space-4)' }}>
            <PasswordField
              id="cp-current"
              label="Current (temporary) password"
              value={currentPassword}
              onChange={(v) => {
                setCurrentPassword(v)
                setCurrentError(null)
              }}
              error={currentError}
              autoComplete="current-password"
            />
          </div>

          <div style={{ marginTop: 'var(--zg-space-4)' }}>
            <PasswordField
              id="cp-new"
              label="New password"
              value={newPassword}
              onChange={(v) => {
                setNewPassword(v)
                setWeakError(null)
              }}
              error={newPasswordError}
              autoComplete="new-password"
            />
            <PasswordChecklist value={newPassword} />
          </div>

          <div style={{ marginTop: 'var(--zg-space-4)' }}>
            <PasswordField
              id="cp-confirm"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              error={confirmError}
              autoComplete="new-password"
            />
          </div>

          <div className="zg-actions" style={{ marginTop: 'var(--zg-space-4)' }}>
            <button
              type="submit"
              className="zg-btn zg-btn-primary"
              disabled={submitting || !canSubmit}
              aria-disabled={submitting || !canSubmit}
            >
              {submitting && <span className="zg-spinner" aria-hidden="true" />}
              {submitting ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ChangePassword
