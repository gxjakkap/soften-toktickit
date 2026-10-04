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

// Issue #6: the IT Staff Ticket Queue's own fixture identity.
export const testStaffUser: AuthUser = {
  id: 12,
  name: 'Sarah Johnson',
  email: 'sarah.johnson@example.com',
  role: 'IT_STAFF',
  mustChangePassword: false,
}

// Issue #8: the Administrator User Management fixture identity.
export const testAdminUser: AuthUser = {
  id: 21,
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  role: 'ADMINISTRATOR',
  mustChangePassword: false,
}
