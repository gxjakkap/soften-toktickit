import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// Superseded by Lab 2 (api-spec.md §2): Category gained `isActive`, and this
// endpoint now returns only active rows as {id, name}. See also API-25 in
// tests/lab-02/reference-data.api.test.ts for fixture-controlled coverage of
// the active-only filter (exact-equality against a live table snapshot isn't
// safe here since other test files' fixtures can exist mid-run).
//
// Superseded again by Lab 3 (specification.md §12-12): the endpoint now
// requires an authenticated session.
const TAG = 'categories-list.test.invalid'
let cookie: string

beforeAll(async () => {
  const passwordHash = await hashPassword('DevPass123!')
  await prisma.user.upsert({
    where: { email: `requester.${TAG}` },
    create: {
      passwordHash,
      role: 'REQUESTER',
      name: 'Categories Fixture',
      email: `requester.${TAG}`,
    },
    update: {},
  })
  cookie = await loginCookie(app, `requester.${TAG}`)
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: `requester.${TAG}` } })
})

describe('GET /api/categories', () => {
  it('returns only active categories, ordered by id ascending, as {id, name}', async () => {
    const res = await request(app).get('/api/categories').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual(
      expect.arrayContaining(
        ['Account and Access', 'Hardware', 'Software', 'Network'].map((name) =>
          expect.objectContaining({ name }),
        ),
      ),
    )

    for (const category of res.body) {
      expect(Object.keys(category).sort()).toEqual(['id', 'name'])
    }

    const ids = res.body.map((category: { id: number }) => category.id)
    expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b))
  })
})
