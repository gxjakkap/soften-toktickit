import type { UserRole } from '../types'

// ui-spec.md §2/§5/§6/§7: each role's default landing screen and the target
// of every "back to your home page" link on a forbidden state.
export function roleHomePath(role: UserRole): string {
  if (role === 'IT_STAFF') return '/staff/tickets'
  if (role === 'ADMINISTRATOR') return '/admin/users'
  return '/tickets'
}
