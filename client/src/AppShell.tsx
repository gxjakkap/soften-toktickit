import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'zg-navlink is-active' : 'zg-navlink'

const ROLE_LABEL = { REQUESTER: 'Requester', IT_STAFF: 'IT Staff', ADMINISTRATOR: 'Administrator' }

function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  // ui-spec.md §1: available at all times from the Profile menu; ends the
  // session and returns to Login (replaces Lab 2's Change Requester action).
  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <>
      <header className="zg-header">
        <div className="zg-header-inner">
          <NavLink to="/tickets" className="zg-wordmark">
            TokTickIT
          </NavLink>

          {/* Mobile only (ui-spec §10): nav + Requester info collapse behind
              this toggle instead of wrapping onto extra header lines. */}
          <button
            type="button"
            className="zg-menu-toggle"
            aria-label="Open menu"
            title="Menu"
            aria-expanded={menuOpen}
            aria-controls="zg-header-collapsible"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i className={`bi ${menuOpen ? 'bi-x-lg' : 'bi-list'}`} aria-hidden="true" />
          </button>

          <div
            id="zg-header-collapsible"
            className={`zg-header-collapsible${menuOpen ? ' is-open' : ''}`}
          >
            <nav className="zg-nav" aria-label="Main">
              <NavLink to="/tickets" className={navClass} end onClick={() => setMenuOpen(false)}>
                My Tickets
              </NavLink>
              <NavLink to="/tickets/new" className={navClass} onClick={() => setMenuOpen(false)}>
                Create Ticket
              </NavLink>
            </nav>

            <div className="zg-header-requester">
              <span data-testid="current-user">
                <strong>{user?.name}</strong> · {user && ROLE_LABEL[user.role]}
              </span>
              <button type="button" className="zg-btn zg-btn-tertiary" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="zg-page">{children}</main>
    </>
  )
}

export default AppShell
