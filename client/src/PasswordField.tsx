import { useState } from 'react'

// ui-spec.md §2/§3: every password field on Login and Change Password is
// masked with a show/hide toggle; the field-level error sits directly below.
function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`

  return (
    <div>
      <label className="zg-label" htmlFor={id}>
        {label} <span className="zg-required">*</span>
      </label>
      <div className="zg-password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          className={`zg-field${error ? ' zg-field-invalid' : ''}`}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="zg-password-toggle"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          title={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
        >
          <i className={`bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p id={errorId} className="zg-error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default PasswordField
