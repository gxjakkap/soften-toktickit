import type { AuthUser } from '../../src/types'

// Shared by every test that renders AppRoutes/RequireAuth: the session the
// AuthProvider discovers via GET /api/auth/me on mount (replaces Lab 2's
// localStorage-seeded RequesterProvider fixture).
export const testUser: AuthUser = {
  id: 7,
  name: 'Priya Shah',
  email: 'priya.shah@example.com',
  role: 'REQUESTER',
  mustChangePassword: false,
}
