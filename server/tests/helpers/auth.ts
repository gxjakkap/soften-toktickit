import request from 'supertest'
import type { Express } from 'express'

// Shared by every lab-03+ test file that needs a real session cookie instead
// of Lab 2's client-supplied requesterId (BR-03, BR-16).
export async function loginCookie(
  app: Express,
  email: string,
  password = 'DevPass123!',
): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password })
  const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
    c.startsWith('tik_session='),
  )!
  return raw.split(';')[0]!
}
