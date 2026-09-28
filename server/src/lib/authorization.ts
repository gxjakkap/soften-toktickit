import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { resolveAuthenticatedUser } from './auth-context.js'
import type { User, UserRole } from '../generated/prisma/client.js'

// Issue #4, specification.md §5 (FR-06, FR-24) and api-spec.md §0.1, §1.5: the
// single seam every protected route (other than /api/auth/*) goes through to
// answer "who is asking, and are they allowed here" — mirrors auth-context.ts
// being the one seam for "who is asking" itself.

declare global {
  namespace Express {
    interface Request {
      user?: User
    }
  }
}

const unauthenticated = {
  error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to continue.' },
}

// api-spec.md §0.1: resolves the session and attaches the caller, or 401s.
// No route reads the cookie or looks up a session itself (mirrors BR-31's
// "single seam" rule for requester-context.ts).
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = await resolveAuthenticatedUser(req)
  if (!auth) return res.status(401).json(unauthenticated)
  req.user = auth.user
  next()
}

// api-spec.md §1.5: every protected endpoint other than /api/auth/* rejects a
// caller who still owes a mandatory password change.
export function requirePasswordChangeSatisfied(req: Request, res: Response, next: NextFunction) {
  if (req.user!.mustChangePassword) {
    return res.status(403).json({
      error: {
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before continuing.',
      },
    })
  }
  next()
}

// The standard guard for any non-auth protected route: authenticate, then
// enforce the password-change gate.
export const requireAuth: RequestHandler[] = [authenticate, requirePasswordChangeSatisfied]

// api-spec.md §0.1 role rule: authenticated but the wrong role is 403, never
// 404 — the resource genuinely exists and the caller's identity is known.
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Defensive: a route mounted without `requireAuth` ahead of it should
    // surface as 401, not throw and land in the error envelope as a 500 that
    // hides the real cause (PR #49 review).
    if (!req.user) return res.status(401).json(unauthenticated)
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.',
        },
      })
    }
    next()
  }
}

// BR-03: ownership is decided from the authenticated identity, never from a
// client-supplied id. Pure so it can be unit-tested without a request/DB.
export const isOwner = (userId: number, resourceOwnerId: number | null | undefined): boolean =>
  resourceOwnerId != null && resourceOwnerId === userId
