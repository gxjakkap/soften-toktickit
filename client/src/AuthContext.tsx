import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ApiError,
  changePassword as apiChangePassword,
  fetchCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  sessionInvalidated,
} from './apiClient'
import { AuthContext, type AuthStatus } from './useAuth'
import type { AuthUser } from './types'

/** BR-03/BR-31: identity now comes from the session cookie, resolved once on
 *  mount via GET /api/auth/me — replaces Lab 2's client-side dev requester
 *  selection (RequesterContext.tsx), which trusted a locally-stored id. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        setUser(u)
        setStatus('authenticated')
      })
      .catch(() => setStatus('anonymous'))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiLogin(email, password)
    setUser(u)
    setStatus('authenticated')
    return u
  }, [])

  // api-spec.md §1.4 (FR-02, BR-02): issues a fresh session and clears
  // mustChangePassword, unblocking every other protected endpoint.
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const u = await apiChangePassword(currentPassword, newPassword)
    setUser(u)
    setStatus('authenticated')
    return u
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch (err) {
      // A session that's already gone server-side (expired, deleted) still
      // needs local state cleared, so a failed logout call isn't fatal here.
      if (!(err instanceof ApiError)) throw err
    }
    setUser(null)
    setStatus('anonymous')
  }, [])

  // The session was rejected mid-use (expired, revoked) — every screen
  // already goes through apiClient, so reacting here is enough.
  useEffect(() => {
    const handleInvalidated = () => {
      setUser(null)
      setStatus('anonymous')
    }
    sessionInvalidated.addEventListener('invalidated', handleInvalidated)
    return () => sessionInvalidated.removeEventListener('invalidated', handleInvalidated)
  }, [])

  const value = useMemo(
    () => ({ user, status, login, logout, changePassword }),
    [user, status, login, logout, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
