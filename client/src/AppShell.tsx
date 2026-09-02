import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useRequester } from './RequesterContext'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'zg-navlink is-active' : 'zg-navlink'

function AppShell({ children }: { children: ReactNode }) {
  const { requester, clearRequester } = useRequester()
  const navigate = useNavigate()

  // BR-11: available at all times; clears the previous context and returns to
  // the selection screen.
  const changeRequester = () => {
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

          <nav className="zg-nav" aria-label="Main">
            <NavLink to="/tickets" className={navClass} end>
              My Tickets
            </NavLink>
            <NavLink to="/tickets/new" className={navClass}>
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
      </header>

      <main className="zg-page">{children}</main>
    </>
  )
}

export default AppShell
