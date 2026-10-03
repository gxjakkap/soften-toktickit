import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import AppShell from './AppShell'
import ChangePassword from './ChangePassword'
import CreateTicket from './CreateTicket'
import { roleHomePath } from './lib/role-routes'
import Login from './Login'
import MyTickets from './MyTickets'
import RequesterTicketDetail from './RequesterTicketDetail'
import StaffTicketDetail from './StaffTicketDetail'
import StaffTicketQueue from './StaffTicketQueue'
import UserManagement from './UserManagement'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'
import SystemCheck from './SystemCheck'

/** BR-03: no authenticated session means every protected screen bounces to
 *  Login, whether reached by nav or by a pasted URL. FR-02/AC-02: a user who
 *  must change their password cannot reach any other authenticated screen
 *  until they do. */
function RequireAuth() {
  const { user, status } = useAuth()
  if (status === 'loading') return null
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />

  return (
    <AppShell>
      {/* Keying on the user id remounts every protected screen on a
          session change, so their data reloads instead of going stale
          (carried forward from Lab 2's FR-13 requester-switch behavior). */}
      <div key={user.id} data-testid="auth-scope">
        <Outlet />
      </div>
    </AppShell>
  )
}

/** ui-spec.md §3: this screen is reachable only while mustChangePassword is
 *  true — once satisfied, it redirects to the role's own landing screen. */
function RequireAuthForPasswordChange() {
  const { user, status } = useAuth()
  if (status === 'loading') return null
  if (!user) return <Navigate to="/login" replace />
  if (!user.mustChangePassword) return <Navigate to={roleHomePath(user.role)} replace />
  return <ChangePassword />
}

function DefaultRedirect() {
  const { user, status } = useAuth()
  if (status === 'loading') return null
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  return <Navigate to={roleHomePath(user.role)} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<RequireAuthForPasswordChange />} />
      <Route path="/system-check" element={<SystemCheck />} />

      <Route element={<RequireAuth />}>
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/tickets/new" element={<CreateTicket />} />
        <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
        <Route path="/staff/tickets" element={<StaffTicketQueue />} />
        <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        <Route path="/admin/users" element={<UserManagement />} />
      </Route>

      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
