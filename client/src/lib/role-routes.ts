import type { UserRole } from '../types'

// ui-spec.md §2/§5/§6/§7: each role's default landing screen and the target
// of every "back to your home page" link on a forbidden state. Lab 4
// ui-spec.md §1 (FR-17, §11-8): IT Staff and Administrators land on the
// Dashboard.
// Requesters keep My Tickets until their dashboard ships (#68).
export function roleHomePath(role: UserRole): string {
  if (role === 'REQUESTER') return '/tickets'
  return '/dashboard'
}
