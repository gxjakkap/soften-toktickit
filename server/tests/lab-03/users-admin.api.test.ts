import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword, verifyPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// API-5.1..5.4 (api-spec.md §5), Issue #8. AC-09, AC-11, AC-27..AC-33, AC-35
// (FR-20..23, FR-25..27, BR-10, BR-11, BR-15, BR-33..38). Fixtures live under TAG
// and are removed in afterAll; the seeded accounts are only read, except in the
// last-Administrator test, which restores what it touches.
const TAG = 'lab3.admin-users.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`

const ADMIN = email('admin')
const STAFF = email('staff')
const REQUESTER = email('requester')
const SEEDED_ADMIN = 'alex.morgan@example.com'

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  await prisma.user.createMany({
    data: [
      { name: 'Zed Admin', email: ADMIN, role: 'ADMINISTRATOR' as const },
      { name: 'Zed Staff', email: STAFF, role: 'IT_STAFF' as const },
      { name: 'Zed Requester', email: REQUESTER, role: 'REQUESTER' as const },
    ].map((u) => ({ ...u, passwordHash, isActive: true })),
  })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
})

const as = (cookie: string) => ({ Cookie: cookie })
const newUser = (overrides: Record<string, unknown> = {}) => ({
  name: 'New Person',
  email: email('new.person'),
  role: 'REQUESTER',
  isActive: true,
  initialPassword: 'N3w!Passw0rd',
  ...overrides,
})

describe('non-Administrator callers are rejected on every endpoint (AC-11, AC-35)', () => {
  const calls: [string, string][] = [
    ['get', '/api/admin/users'],
    ['post', '/api/admin/users'],
    ['patch', '/api/admin/users/1'],
    ['patch', '/api/admin/users/1/password'],
  ]
  for (const who of [STAFF, REQUESTER]) {
    for (const [method, path] of calls) {
      it(`403 FORBIDDEN: ${who.split('@')[0]} ${method.toUpperCase()} ${path}`, async () => {
        const cookie = await loginCookie(app, who)
        const res = await (request(app) as any)[method](path).set(as(cookie)).send({})
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
      })
    }
  }

  it('401 UNAUTHENTICATED with no session', async () => {
    for (const [method, path] of calls) {
      const res = await (request(app) as any)[method](path).send({})
      expect(res.status).toBe(401)
    }
  })
})

describe('GET /api/admin/users (FR-20, BR-38, BR-39, AC-27, AC-28)', () => {
  it('lists every user with the documented shape, name ascending, no secrets', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app).get('/api/admin/users').set(as(cookie))
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(res.body.data.length)
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      'email',
      'id',
      'isActive',
      'name',
      'role',
    ])
    const names: string[] = res.body.data.map((u: { name: string }) => u.name)
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    const seeded = res.body.data.filter((u: { email: string }) => u.email.endsWith('@example.com'))
    expect(seeded.map((u: { role: string }) => u.role)).toEqual(
      expect.arrayContaining(['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']),
    )
    expect(seeded.some((u: { isActive: boolean }) => !u.isActive)).toBe(true)
  })

  it('search matches name or email, case-insensitively and partially', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const byName = await request(app).get('/api/admin/users?search=ALEX%20mor').set(as(cookie))
    expect(byName.body.data.map((u: { email: string }) => u.email)).toContain(SEEDED_ADMIN)
    const byEmail = await request(app).get(`/api/admin/users?search=${TAG}`).set(as(cookie))
    expect(byEmail.body.totalCount).toBe(3)
    const none = await request(app).get('/api/admin/users?search=zzzz-no-match').set(as(cookie))
    expect(none.body).toEqual({ data: [], totalCount: 0 })
  })

  it('role filter narrows, and combines with search using AND', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const staff = await request(app).get('/api/admin/users?role=IT_STAFF').set(as(cookie))
    expect(staff.body.data.every((u: { role: string }) => u.role === 'IT_STAFF')).toBe(true)
    const both = await request(app)
      .get(`/api/admin/users?role=REQUESTER&search=${TAG}`)
      .set(as(cookie))
    expect(both.body.data.map((u: { email: string }) => u.email)).toEqual([REQUESTER])
  })

  it('400 INVALID_FILTER for an unrecognized role', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app).get('/api/admin/users?role=OWNER').set(as(cookie))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_FILTER')
  })
})

describe('POST /api/admin/users (FR-21, BR-10, BR-11, BR-15, BR-33, AC-09, AC-29, AC-30)', () => {
  it('201 creates a user who must change the initial password at first login', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app).post('/api/admin/users').set(as(cookie)).send(newUser())
    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: 'New Person',
      email: email('new.person'),
      role: 'REQUESTER',
      isActive: true,
    })
    const row = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(row.mustChangePassword).toBe(true)
    expect(row.passwordHash).not.toBe('N3w!Passw0rd')
    expect(await verifyPassword('N3w!Passw0rd', row.passwordHash)).toBe(true)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: email('new.person'), password: 'N3w!Passw0rd' })
    expect(login.body.mustChangePassword).toBe(true)
  })

  it('409 DUPLICATE_EMAIL, including a differently-cased match, and nothing is created', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app)
      .post('/api/admin/users')
      .set(as(cookie))
      .send(newUser({ email: email('NEW.Person') }))
    expect(res.status).toBe(409)
    expect(res.body.error).toMatchObject({ code: 'DUPLICATE_EMAIL', field: 'email' })
    expect(await prisma.user.count({ where: { email: email('new.person') } })).toBe(1)
  })

  it('400 VALIDATION_ERROR for an invalid or missing role', async () => {
    const cookie = await loginCookie(app, ADMIN)
    for (const role of ['SUPERUSER', 'requester', ['REQUESTER', 'IT_STAFF'], undefined]) {
      const res = await request(app)
        .post('/api/admin/users')
        .set(as(cookie))
        .send(newUser({ email: email('badrole'), role }))
      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'role' })
    }
    expect(await prisma.user.count({ where: { email: email('badrole') } })).toBe(0)
  })

  it('400 VALIDATION_ERROR for a blank name or malformed email', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const blank = await request(app)
      .post('/api/admin/users')
      .set(as(cookie))
      .send(newUser({ name: '   ' }))
    expect(blank.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'name' })
    const bad = await request(app)
      .post('/api/admin/users')
      .set(as(cookie))
      .send(newUser({ email: 'not-an-email' }))
    expect(bad.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'email' })
  })

  it('400 WEAK_PASSWORD when the password lacks a special character, and no user is created', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app)
      .post('/api/admin/users')
      .set(as(cookie))
      .send(newUser({ email: email('weak'), initialPassword: 'NoSpecial123' }))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('WEAK_PASSWORD')
    expect(await prisma.user.count({ where: { email: email('weak') } })).toBe(0)
  })

  it('can create an inactive Administrator', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app)
      .post('/api/admin/users')
      .set(as(cookie))
      .send(newUser({ email: email('dormant.admin'), role: 'ADMINISTRATOR', isActive: false }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ role: 'ADMINISTRATOR', isActive: false })
  })
})

describe('PATCH /api/admin/users/:id (FR-22, FR-25..27, BR-34..36, AC-31, AC-32)', () => {
  const idOf = async (e: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email: e } })).id

  it('200 edits name, email, role and active state', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const created = await request(app)
      .post('/api/admin/users')
      .set(as(cookie))
      .send(newUser({ email: email('editme'), name: 'Edit Me' }))
    const res = await request(app)
      .patch(`/api/admin/users/${created.body.id}`)
      .set(as(cookie))
      .send({ name: 'Edited', email: email('Edited.Mail'), role: 'IT_STAFF', isActive: false })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: created.body.id,
      name: 'Edited',
      email: email('edited.mail'),
      role: 'IT_STAFF',
      isActive: false,
    })
  })

  it('deactivating or changing the role of a user ends their sessions (BR-34)', async () => {
    const adminCookie = await loginCookie(app, ADMIN)
    const created = await request(app)
      .post('/api/admin/users')
      .set(as(adminCookie))
      .send(newUser({ email: email('sessioned'), role: 'IT_STAFF' }))
    await prisma.user.update({
      where: { id: created.body.id },
      data: { mustChangePassword: false },
    })
    const victim = await loginCookie(app, email('sessioned'), 'N3w!Passw0rd')
    expect((await request(app).get('/api/auth/me').set(as(victim))).status).toBe(200)

    await request(app)
      .patch(`/api/admin/users/${created.body.id}`)
      .set(as(adminCookie))
      .send({ role: 'REQUESTER' })
    expect((await request(app).get('/api/auth/me').set(as(victim))).status).toBe(401)
  })

  it('409 DUPLICATE_EMAIL when the new email belongs to another user, any case', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app)
      .patch(`/api/admin/users/${await idOf(STAFF)}`)
      .set(as(cookie))
      .send({ email: REQUESTER.toUpperCase() })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatchObject({ code: 'DUPLICATE_EMAIL', field: 'email' })
  })

  it('keeping one’s own email (even re-cased) is not a duplicate', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app)
      .patch(`/api/admin/users/${await idOf(STAFF)}`)
      .set(as(cookie))
      .send({ email: STAFF.toUpperCase(), name: 'Zed Staff' })
    expect(res.status).toBe(200)
    expect(res.body.email).toBe(STAFF)
  })

  it('400 VALIDATION_ERROR for an invalid role, empty body or wrong types; 404 for unknown id', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const id = await idOf(STAFF)
    const role = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set(as(cookie))
      .send({ role: 'ROOT' })
    expect(role.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'role' })
    const active = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set(as(cookie))
      .send({ isActive: 'no' })
    expect(active.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'isActive' })
    const empty = await request(app).patch(`/api/admin/users/${id}`).set(as(cookie)).send({})
    expect(empty.status).toBe(400)
    const missing = await request(app)
      .patch('/api/admin/users/999999999')
      .set(as(cookie))
      .send({ name: 'x' })
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')
  })

  it('409 SELF_DEACTIVATION when the caller deactivates their own account (BR-35)', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const id = await idOf(ADMIN)
    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set(as(cookie))
      .send({ isActive: false })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SELF_DEACTIVATION')
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).isActive).toBe(true)
  })

  it('self-deactivation is decided from the session, not a client-supplied id', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const id = await idOf(ADMIN)
    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set(as(cookie))
      .send({ isActive: false, id: 1, actingUserId: 1, requesterId: 1 })
    expect(res.body.error.code).toBe('SELF_DEACTIVATION')
  })

  describe('last active Administrator (FR-26, BR-36, AC-32)', () => {
    // Only an active Administrator can call this API, so the "last" one can only
    // be hit through their own edit. Make the fixture Administrator the only
    // active one for the test, then restore every Administrator it touched.
    async function withSoleAdmin(fn: () => Promise<void>) {
      const others = await prisma.user.findMany({
        where: { role: 'ADMINISTRATOR', isActive: true, email: { not: ADMIN } },
        select: { id: true },
      })
      const ids = others.map((o) => o.id)
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })
      try {
        await fn()
      } finally {
        await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: true } })
        await prisma.user.update({
          where: { email: ADMIN },
          data: { role: 'ADMINISTRATOR', isActive: true },
        })
      }
    }

    it('409 LAST_ADMINISTRATOR when the only active Administrator changes their own role', async () => {
      await withSoleAdmin(async () => {
        const cookie = await loginCookie(app, ADMIN)
        const id = await idOf(ADMIN)
        const res = await request(app)
          .patch(`/api/admin/users/${id}`)
          .set(as(cookie))
          .send({ role: 'IT_STAFF' })
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('LAST_ADMINISTRATOR')
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).role).toBe('ADMINISTRATOR')
      })
    })

    it('demoting the other Administrator works, after which the caller is the last one', async () => {
      await withSoleAdmin(async () => {
        const second = await prisma.user.create({
          data: {
            name: 'Second Admin',
            email: email('second.admin'),
            role: 'ADMINISTRATOR',
            passwordHash: await hashPassword(PASSWORD),
          },
        })
        const cookie = await loginCookie(app, ADMIN)
        const demote = await request(app)
          .patch(`/api/admin/users/${second.id}`)
          .set(as(cookie))
          .send({ role: 'IT_STAFF' })
        expect(demote.status).toBe(200)

        const self = await request(app)
          .patch(`/api/admin/users/${await idOf(ADMIN)}`)
          .set(as(cookie))
          .send({ role: 'REQUESTER' })
        expect(self.status).toBe(409)
        expect(self.body.error.code).toBe('LAST_ADMINISTRATOR')
      })
    })

    it('an Administrator may demote themself while another active Administrator remains', async () => {
      await withSoleAdmin(async () => {
        await prisma.user.create({
          data: {
            name: 'Third Admin',
            email: email('third.admin'),
            role: 'ADMINISTRATOR',
            passwordHash: await hashPassword(PASSWORD),
          },
        })
        const cookie = await loginCookie(app, ADMIN)
        const res = await request(app)
          .patch(`/api/admin/users/${await idOf(ADMIN)}`)
          .set(as(cookie))
          .send({ role: 'IT_STAFF' })
        expect(res.status).toBe(200)
      })
    })
  })
})

describe('PATCH /api/admin/users/:id/password (FR-23, BR-37, AC-30)', () => {
  it('200 replaces the hash, forces a change at next login, and ends their sessions', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const target = await prisma.user.findUniqueOrThrow({ where: { email: REQUESTER } })
    const victim = await loginCookie(app, REQUESTER)

    const res = await request(app)
      .patch(`/api/admin/users/${target.id}/password`)
      .set(as(cookie))
      .send({ newPassword: 'An0ther!Pass' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: target.id, mustChangePassword: true })

    expect((await request(app).get('/api/auth/me').set(as(victim))).status).toBe(401)
    const old = await request(app)
      .post('/api/auth/login')
      .send({ email: REQUESTER, password: PASSWORD })
    expect(old.status).toBe(401)
    const fresh = await request(app)
      .post('/api/auth/login')
      .send({ email: REQUESTER, password: 'An0ther!Pass' })
    expect(fresh.status).toBe(200)
    expect(fresh.body.mustChangePassword).toBe(true)
  })

  it('400 WEAK_PASSWORD and the hash is unchanged', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const target = await prisma.user.findUniqueOrThrow({ where: { email: STAFF } })
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}/password`)
      .set(as(cookie))
      .send({ newPassword: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('WEAK_PASSWORD')
    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(after.passwordHash).toBe(target.passwordHash)
  })

  it('404 NOT_FOUND for an unknown user', async () => {
    const cookie = await loginCookie(app, ADMIN)
    const res = await request(app)
      .patch('/api/admin/users/999999999/password')
      .set(as(cookie))
      .send({ newPassword: 'An0ther!Pass' })
    expect(res.status).toBe(404)
  })
})
