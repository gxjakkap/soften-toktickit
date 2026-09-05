import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import AppShell from './AppShell'
import CreateTicket from './CreateTicket'
import DevRequesterSelection from './DevRequesterSelection'
import { RequesterProvider, useRequester } from './RequesterContext'
import SystemCheck from './SystemCheck'

// ponytail: placeholder until the Create Ticket / My Tickets / Ticket Detail
// issues land. The routes exist now only so the BR-12 guard has something to
// guard; replace the element, not the routing.
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="zg-card">
      <h1 className="zg-title">{title}</h1>
      <p className="zg-helper">This screen arrives in a later Lab 2 issue.</p>
    </div>
  )
}

/** BR-12: no selected Requester means every Requester-scoped screen bounces to
 *  the selection screen, whether reached by nav or by a pasted URL. */
function RequireRequester() {
  const { requester } = useRequester()
  if (!requester) return <Navigate to="/select-requester" replace />

  return (
    <AppShell>
      {/* FR-13: keying on the requester id remounts every Requester-scoped
          screen on a switch, so their data reloads instead of going stale. */}
      <div key={requester.id} data-testid="requester-scope" data-requester-id={requester.id}>
        <Outlet />
      </div>
    </AppShell>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/select-requester" element={<DevRequesterSelection />} />
      <Route path="/system-check" element={<SystemCheck />} />

      <Route element={<RequireRequester />}>
        <Route path="/tickets" element={<ComingSoon title="My Tickets" />} />
        <Route path="/tickets/new" element={<CreateTicket />} />
        <Route path="/tickets/:id" element={<ComingSoon title="Ticket Detail" />} />
      </Route>

      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <RequesterProvider>
        <AppRoutes />
      </RequesterProvider>
    </BrowserRouter>
  )
}

export default App
