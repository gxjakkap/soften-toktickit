import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  createAdminUser,
  fetchAdminUsers,
  setAdminUserPassword,
  updateAdminUser,
} from './apiClient'
import { RoleBadge, UserStatusBadge } from './badges'
import Forbidden from './Forbidden'
import { isStrongPassword } from './lib/password-rules'
import { roleHomePath } from './lib/role-routes'
import PasswordChecklist from './PasswordChecklist'
import { useAuth } from './useAuth'
import type { AdminUser, UserRole } from './types'

// ui-spec.md §7, api-spec.md §5 (FR-20..23, FR-25..27, BR-33..39, AC-27..34).
// Every disabled control here is a convenience: the server enforces the same
// rules regardless (FR-06).

type LoadState = 'loading' | 'ready' | 'error'
type Panel = { mode: 'create' } | { mode: 'edit'; user: AdminUser } | null
type FieldErrors = Partial<Record<'name' | 'email' | 'role' | 'initialPassword', string>>

const SEARCH_DEBOUNCE_MS = 300
const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'REQUESTER', label: 'Requester' },
  { value: 'IT_STAFF', label: 'IT Staff' },
  { value: 'ADMINISTRATOR', label: 'Administrator' },
]
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function UserPanel({
  panel,
  currentUserId,
  onClose,
  onSaved,
}: {
  panel: Exclude<Panel, null>
  currentUserId: number
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const editing = panel.mode === 'edit' ? panel.user : null

  const [name, setName] = useState(editing?.name ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [role, setRole] = useState<UserRole | ''>(editing?.role ?? '')
  const [isActive, setIsActive] = useState(editing?.isActive ?? true)
  const [initialPassword, setInitialPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [pwOpen, setPwOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwDone, setPwDone] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)

  // ui-spec.md §7: the last-Administrator treatment needs the active
  // Administrator count, which the (possibly filtered) list can't give.
  const [lastAdmin, setLastAdmin] = useState(false)
  useEffect(() => {
    if (!editing || editing.role !== 'ADMINISTRATOR' || !editing.isActive) return
    let cancelled = false
    fetchAdminUsers({ role: 'ADMINISTRATOR' })
      .then((res) => {
        if (!cancelled) setLastAdmin(res.data.filter((u) => u.isActive).length <= 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [editing])

  const isSelf = editing?.id === currentUserId
  const activeLocked = isSelf || lastAdmin
  const roleLocked = lastAdmin

  const applyServerError = (err: unknown) => {
    if (!(err instanceof ApiError)) {
      setBanner('Something went wrong. Please try again.')
      return
    }
    if (err.field === 'name' || err.field === 'email' || err.field === 'role') {
      setErrors({ [err.field]: err.message })
    } else if (err.field === 'initialPassword') {
      setErrors({ initialPassword: err.message })
    } else {
      setBanner(err.message)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBanner(null)

    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'Name is required.'
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.'
    if (!role) next.role = 'Choose a role.'
    if (!editing && !isStrongPassword(initialPassword)) {
      next.initialPassword = 'Password does not meet the rules below.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || !role) return

    setBusy(true)
    try {
      if (editing) {
        const changes: Partial<Pick<AdminUser, 'name' | 'email' | 'role' | 'isActive'>> = {}
        if (name.trim() !== editing.name) changes.name = name.trim()
        if (email.trim().toLowerCase() !== editing.email) changes.email = email.trim()
        if (role !== editing.role) changes.role = role
        if (isActive !== editing.isActive) changes.isActive = isActive
        if (Object.keys(changes).length === 0) {
          setBanner('No changes to save.')
          return
        }
        await updateAdminUser(editing.id, changes)
        onSaved('User updated.')
      } else {
        await createAdminUser({
          name: name.trim(),
          email: email.trim(),
          role,
          isActive,
          initialPassword,
        })
        onSaved('User created.')
      }
    } catch (err) {
      applyServerError(err)
    } finally {
      setBusy(false)
    }
  }

  const submitPassword = async () => {
    if (!editing) return
    setPwError(null)
    setPwDone(false)
    if (!isStrongPassword(newPassword)) {
      setPwError('Password does not meet the rules below.')
      return
    }
    setPwBusy(true)
    try {
      await setAdminUserPassword(editing.id, newPassword)
      setNewPassword('')
      setPwDone(true)
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setPwBusy(false)
    }
  }

  const title = editing ? 'Edit User' : 'Create User'

  return (
    <aside className="zg-um-panel zg-card" aria-label={title} data-testid="user-panel">
      <h2 className="zg-section-heading">{title}</h2>
      <form onSubmit={submit} noValidate>
        {banner && (
          <p className="zg-error" role="alert">
            {banner}
          </p>
        )}

        <div className="zg-um-field">
          <label className="zg-label" htmlFor="um-name">
            Full Name <span className="zg-required">*</span>
          </label>
          <input
            id="um-name"
            className={`zg-field${errors.name ? ' zg-field-invalid' : ''}`}
            value={name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'um-name-error' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name && (
            <p id="um-name-error" className="zg-error-message">
              {errors.name}
            </p>
          )}
        </div>

        <div className="zg-um-field">
          <label className="zg-label" htmlFor="um-email">
            Email Address <span className="zg-required">*</span>
          </label>
          <input
            id="um-email"
            type="email"
            className={`zg-field${errors.email ? ' zg-field-invalid' : ''}`}
            value={email}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'um-email-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && (
            <p id="um-email-error" className="zg-error-message">
              {errors.email}
            </p>
          )}
        </div>

        <div className="zg-um-field">
          <label className="zg-label" htmlFor="um-role">
            Role <span className="zg-required">*</span>
          </label>
          <select
            id="um-role"
            className={`zg-field${errors.role ? ' zg-field-invalid' : ''}`}
            value={role}
            disabled={roleLocked}
            aria-invalid={errors.role ? true : undefined}
            aria-describedby={
              roleLocked ? 'um-role-note' : errors.role ? 'um-role-error' : undefined
            }
            onChange={(e) => setRole(e.target.value as UserRole | '')}
          >
            <option value="">Select a role</option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {roleLocked && (
            <p id="um-role-note" className="zg-helper">
              At least one active Administrator is required.
            </p>
          )}
          {errors.role && (
            <p id="um-role-error" className="zg-error-message">
              {errors.role}
            </p>
          )}
        </div>

        <div className="zg-um-field">
          <label className="zg-um-toggle" htmlFor="um-active">
            <input
              id="um-active"
              type="checkbox"
              role="switch"
              checked={isActive}
              disabled={activeLocked}
              aria-describedby={activeLocked ? 'um-active-note' : undefined}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          {isSelf ? (
            <p id="um-active-note" className="zg-helper">
              You can't deactivate your own account.
            </p>
          ) : lastAdmin ? (
            <p id="um-active-note" className="zg-helper">
              At least one active Administrator is required.
            </p>
          ) : null}
        </div>

        {!editing && (
          <div className="zg-um-field">
            <label className="zg-label" htmlFor="um-initial-password">
              Initial Password <span className="zg-required">*</span>
            </label>
            <input
              id="um-initial-password"
              type="password"
              autoComplete="new-password"
              className={`zg-field${errors.initialPassword ? ' zg-field-invalid' : ''}`}
              value={initialPassword}
              aria-invalid={errors.initialPassword ? true : undefined}
              aria-describedby={errors.initialPassword ? 'um-password-error' : undefined}
              onChange={(e) => setInitialPassword(e.target.value)}
            />
            {errors.initialPassword && (
              <p id="um-password-error" className="zg-error-message">
                {errors.initialPassword}
              </p>
            )}
            <PasswordChecklist value={initialPassword} />
            <p className="zg-helper">The user must change this password at first login.</p>
          </div>
        )}

        <div className="zg-um-actions">
          <button type="submit" className="zg-btn zg-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save Changes' : 'Save User'}
          </button>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>

      {editing && (
        <section className="zg-um-password" aria-label="Set new password">
          <button
            type="button"
            className="zg-btn zg-btn-tertiary"
            aria-expanded={pwOpen}
            aria-controls="um-password-panel"
            onClick={() => setPwOpen((open) => !open)}
          >
            <i className="bi bi-key" aria-hidden="true" />
            Set New Password
          </button>
          {pwOpen && (
            <div id="um-password-panel">
              <label className="zg-label" htmlFor="um-new-password">
                New Initial Password
              </label>
              <input
                id="um-new-password"
                type="password"
                autoComplete="new-password"
                className={`zg-field${pwError ? ' zg-field-invalid' : ''}`}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setPwDone(false)
                }}
              />
              {pwError && (
                <p className="zg-error-message" role="alert">
                  {pwError}
                </p>
              )}
              <PasswordChecklist value={newPassword} />
              <button
                type="button"
                className="zg-btn zg-btn-secondary"
                disabled={pwBusy}
                onClick={submitPassword}
              >
                {pwBusy ? 'Saving…' : 'Save Password'}
              </button>
              {pwDone && (
                <p className="zg-success-banner" role="status">
                  Password set. {editing.name} must change it at next login.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </aside>
  )
}

function UserManagement() {
  const { user } = useAuth()
  const allowed = user?.role === 'ADMINISTRATOR'

  const [state, setState] = useState<LoadState>('loading')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<UserRole | ''>('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(() => {
    if (!allowed) return
    setState('loading')
    fetchAdminUsers({ search: search || undefined, role: role || undefined })
      .then((res) => {
        setUsers(res.data)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [allowed, search, role])

  useEffect(load, [load])

  const clearFilters = () => {
    setSearchInput('')
    setSearch('')
    setRole('')
  }

  const openPanel = (next: Panel) => {
    setToast(null)
    setPanel(next)
  }

  const handleSaved = (message: string) => {
    setPanel(null)
    setToast(message)
    load()
  }

  // ui-spec.md §7: a non-Administrator reaching this route gets a full-page
  // forbidden state, not a redirect; the API rejects them with 403 regardless.
  if (!allowed) {
    return <Forbidden testId="users-forbidden" homeTo={user ? roleHomePath(user.role) : '/login'} />
  }

  const filtered = search !== '' || role !== ''
  const roleLabel = ROLE_OPTIONS.find((o) => o.value === role)?.label

  return (
    <div>
      <div className="zg-actions">
        <div>
          <h1 className="zg-title">User Management</h1>
          <p className="zg-helper">Create users, edit accounts, and reset initial passwords.</p>
        </div>
        <button
          type="button"
          className="zg-btn zg-btn-primary"
          onClick={() => openPanel({ mode: 'create' })}
        >
          <i className="bi bi-plus-lg" aria-hidden="true" />
          Create User
        </button>
      </div>

      {toast && (
        <p className="zg-success-banner" role="status" style={{ marginTop: 'var(--zg-space-4)' }}>
          {toast}
        </p>
      )}

      <div className={`zg-um-layout${panel ? ' has-panel' : ''}`}>
        <section aria-label="Users" className="zg-um-list">
          <div className="zg-filter-row">
            <div className="zg-filter-field" style={{ flex: '2 1 240px' }}>
              <label className="zg-label" htmlFor="um-search">
                Search
              </label>
              <input
                id="um-search"
                className="zg-field"
                type="text"
                placeholder="Search users…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              aria-expanded={filtersOpen}
              aria-controls="um-filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <i className="bi bi-funnel" aria-hidden="true" />
              Filters
            </button>
          </div>

          {filtersOpen && (
            <div
              id="um-filter-panel"
              className="zg-filter-panel"
              style={{ marginTop: 'var(--zg-space-3)' }}
            >
              <div>
                <label className="zg-label" htmlFor="um-role-filter">
                  Role
                </label>
                <select
                  id="um-role-filter"
                  className="zg-field"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole | '')}
                >
                  <option value="">All Roles</option>
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {role && (
            <div className="zg-chip-row" style={{ marginTop: 'var(--zg-space-3)' }}>
              <span className="zg-chip">
                Role: {roleLabel}
                <button
                  type="button"
                  aria-label={`Remove filter: Role: ${roleLabel}`}
                  onClick={() => setRole('')}
                >
                  <i className="bi bi-x" aria-hidden="true" />
                </button>
              </span>
            </div>
          )}

          {state === 'loading' && users.length === 0 && (
            <p
              className="zg-skeleton"
              aria-live="polite"
              style={{ marginTop: 'var(--zg-space-4)' }}
            >
              Loading users…
            </p>
          )}

          {state === 'error' && (
            <div style={{ marginTop: 'var(--zg-space-4)' }}>
              <p className="zg-error" role="alert">
                Unable to load users. Please try again.
              </p>
              <button type="button" className="zg-btn zg-btn-secondary" onClick={load}>
                Retry
              </button>
            </div>
          )}

          {state === 'ready' && users.length === 0 && (
            <div
              className="zg-callout"
              style={{ marginTop: 'var(--zg-space-4)', textAlign: 'center' }}
            >
              <p>No users match your search.</p>
              {filtered && (
                <button type="button" className="zg-btn zg-btn-secondary" onClick={clearFilters}>
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {users.length > 0 && state !== 'error' && (
            <>
              <div className="zg-table-wrap" style={{ marginTop: 'var(--zg-space-4)' }}>
                <table className="zg-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="zg-visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} style={{ cursor: 'default' }}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>
                          <RoleBadge role={u.role} />
                        </td>
                        <td>
                          <UserStatusBadge active={u.isActive} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="zg-btn zg-btn-tertiary zg-btn-sm"
                            aria-label={`Edit ${u.name}`}
                            onClick={() => openPanel({ mode: 'edit', user: u })}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="zg-ticket-cards" style={{ marginTop: 'var(--zg-space-4)' }}>
                {users.map((u) => (
                  <div key={u.id} className="zg-ticket-card" data-testid="user-card">
                    <strong>{u.name}</strong>
                    <div className="zg-helper" style={{ wordBreak: 'break-word' }}>
                      {u.email}
                    </div>
                    <div className="zg-chip-row" style={{ margin: 'var(--zg-space-2) 0' }}>
                      <RoleBadge role={u.role} />
                      <UserStatusBadge active={u.isActive} />
                    </div>
                    <button
                      type="button"
                      className="zg-btn zg-btn-secondary zg-btn-sm"
                      aria-label={`Edit ${u.name} (card)`}
                      onClick={() => openPanel({ mode: 'edit', user: u })}
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {panel && (
          <UserPanel
            // A fresh form per target, so one user's input never leaks into another's.
            key={panel.mode === 'edit' ? `edit-${panel.user.id}` : 'create'}
            panel={panel}
            currentUserId={user!.id}
            onClose={() => setPanel(null)}
            onSaved={handleSaved}
          />
        )}
      </div>
    </div>
  )
}

export default UserManagement
