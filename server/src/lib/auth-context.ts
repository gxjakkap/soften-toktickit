import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { prisma } from '../db.js'
import type { Prisma, User } from '../generated/prisma/client.js'

// The single "who is asking?" seam for authenticated routes (api-spec.md §0.1,
// BR-31): no route reads the cookie or looks up a session itself.

export const SESSION_COOKIE = 'tik_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // BR-13: fixed 12h, no sliding renewal

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function readToken(req: Request): string | null {
  const match = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
  return match?.[1] ?? null
}

// A session counts only if its row is unexpired and its user is still active.
export async function resolveAuthenticatedUser(
  req: Request,
): Promise<{ user: User; sessionId: number } | null> {
  const token = readToken(req)
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null
  return { user: session.user, sessionId: session.id }
}

// Only the hash is stored; the raw token exists solely in the cookie.
export async function startSession(db: Prisma.TransactionClient, res: Response, userId: number) {
  const token = randomBytes(32).toString('base64url')
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS })
}

export const clearSessionCookie = (res: Response) => res.clearCookie(SESSION_COOKIE, cookieOptions)

// passwordHash and every other column stay out of responses (api-spec.md §1.1).
export const toIdentity = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  mustChangePassword: u.mustChangePassword,
})
