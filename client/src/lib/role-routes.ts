import type { UserRole } from '../types'

// ui-spec.md §2/§5/§6/§7: each role's default landing screen and the target
// of every "back to your home page" link on a forbidden state. Lab 4
// ui-spec.md §1 (FR-17, §11-8): every role lands on /dashboard, which
// renders the dashboard for that role.
export function roleHomePath(_role: UserRole): string {
  return '/dashboard'
}
