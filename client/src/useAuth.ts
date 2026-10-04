import { createContext, useContext } from 'react'
import type { AuthUser } from './types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  user: AuthUser | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an AuthProvider')
  return value
}
