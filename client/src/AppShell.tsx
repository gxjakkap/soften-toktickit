import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useRequester } from './RequesterContext'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'zg-navlink is-active' : 'zg-navlink'

function AppShell({ children }: { children: ReactNode }) {
  const { requester, clearRequester } = useRequester()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  // BR-11: available at all times; clears the previous context and returns to
  // the selection screen.
  const changeRequester = () => {
    setMenuOpen(false)
    clearRequester()
    navigate('/select-requester')
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

          <div id="zg-header-collapsible" className={`zg-header-collapsible${menuOpen ? ' is-open' : ''}`}>
            <nav className="zg-nav" aria-label="Main">
              <NavLink to="/tickets" className={navClass} end onClick={() => setMenuOpen(false)}>
                My Tickets
              </NavLink>
              <NavLink to="/tickets/new" className={navClass} onClick={() => setMenuOpen(false)}>
                Create Ticket
              </NavLink>
            </nav>

            <div className="zg-header-requester">
              <span data-testid="current-requester">
                Testing as <strong>{requester?.name}</strong>
              </span>
              <button type="button" className="zg-btn zg-btn-tertiary" onClick={changeRequester}>
                Change Requester
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
