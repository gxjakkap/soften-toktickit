import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import AppShell from './AppShell'
import CreateTicket from './CreateTicket'
import Login from './Login'
import MyTickets from './MyTickets'
import RequesterTicketDetail from './RequesterTicketDetail'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'
import SystemCheck from './SystemCheck'

/** BR-03: no authenticated session means every protected screen bounces to
 *  Login, whether reached by nav or by a pasted URL. */
function RequireAuth() {
  const { user, status } = useAuth()
  if (status === 'loading') return null
  if (!user) return <Navigate to="/login" replace />

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

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/system-check" element={<SystemCheck />} />

      <Route element={<RequireAuth />}>
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/tickets/new" element={<CreateTicket />} />
        <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
      </Route>

      <Route path="*" element={<Navigate to="/tickets" replace />} />
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
