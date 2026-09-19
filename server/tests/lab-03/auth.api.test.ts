import { createHash } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'

// Issue #3, api-spec.md §1.1-§1.4 (no API-nn IDs exist in the Lab 3 contract yet):
// AC-01, AC-02, AC-05, AC-06, AC-07, AC-08, AC-30, AC-33; BR-06, BR-07, BR-09,
// BR-10, BR-12, BR-13, BR-14, BR-15.
//
// Fixtures live under TAG and are removed in afterAll (sessions cascade with users).
const TAG = 'lab3.auth.test.invalid'
const PASSWORD = 'DevPass123!'
const NEW_PASSWORD = 'N3w!Passw0rd'
const email = (name: string) => `${name}@${TAG}`

const fixtures = [
  { name: 'Auth Active', email: email('active'), isActive: true, mustChangePassword: false },
  { name: 'Auth Inactive', email: email('inactive'), isActive: false, mustChangePassword: false },
  {
    name: 'Auth Must Change',
    email: email('mustchange'),
    isActive: true,
    mustChangePassword: true,
  },
  { name: 'Auth Voluntary', email: email('voluntary'), isActive: true, mustChangePassword: false },
  { name: 'Auth Expiry', email: email('expiry'), isActive: true, mustChangePassword: false },
  {
    name: 'Auth Commit Fail',
    email: email('commitfail'),
    isActive: true,
    mustChangePassword: false,
  },
  {
    name: 'Auth Deactivated',
    email: email('deactivated'),
    isActive: true,
    mustChangePassword: false,
  },
]

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  await prisma.user.createMany({
    data: fixtures.map((f) => ({ ...f, passwordHash, role: 'REQUESTER' as const })),
  })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
})

const login = (e: string, password = PASSWORD) =>
  request(app).post('/api/auth/login').send({ email: e, password })

const cookieOf = (res: request.Response) => {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) =>
    c.startsWith('tik_session='),
  )
  return raw
}
const cookieHeader = (res: request.Response) => cookieOf(res)!.split(';')[0]!
const tokenOf = (res: request.Response) => cookieHeader(res).slice('tik_session='.length)
const sessionCount = (e: string) => prisma.session.count({ where: { user: { email: e } } })

describe('POST /api/auth/login (§1.1)', () => {
  it('returns the identity shape and sets an httpOnly SameSite=Lax session cookie (AC-01)', async () => {
    const res = await login(email('active'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: 'Auth Active',
      email: email('active'),
      role: 'REQUESTER',
      mustChangePassword: false,
    })
    const cookie = cookieOf(res)!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).not.toMatch(/Secure/i)
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('stores only the SHA-256 of the token, expiring 12 hours out (BR-13)', async () => {
    const res = await login(email('active'))
    const token = tokenOf(res)
    const hash = createHash('sha256').update(token).digest('hex')

    const session = await prisma.session.findUnique({ where: { tokenHash: hash } })
    expect(session).not.toBeNull()
    expect(await prisma.session.findFirst({ where: { tokenHash: token } })).toBeNull()
    const twelveHours = 12 * 60 * 60 * 1000
    expect(Math.abs(session!.expiresAt.getTime() - (Date.now() + twelveHours))).toBeLessThan(10_000)
  })

  it('deletes expired session rows on login so the table does not only grow (BR-13)', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: email('active') } })
    const stale = await prisma.session.create({
      data: {
        tokenHash: `expired-${TAG}`,
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    })

    await login(email('active'))

    expect(await prisma.session.findUnique({ where: { id: stale.id } })).toBeNull()
  })

  it('matches the email case-insensitively (BR-15)', async () => {
    const res = await login(email('active').toUpperCase())
    expect(res.status).toBe(200)
    expect(res.body.email).toBe(email('active'))
  })

  it('answers unknown email and wrong password identically and creates no session (AC-05, BR-06)', async () => {
    const before = await sessionCount(email('active'))
    const unknown = await login(email('nobody'))
    const wrong = await login(email('active'), 'WrongPass1!')

    expect(unknown.status).toBe(401)
    expect(unknown.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    })
    expect(wrong.status).toBe(unknown.status)
    expect(wrong.body).toEqual(unknown.body)
    expect(cookieOf(unknown)).toBeUndefined()
    expect(cookieOf(wrong)).toBeUndefined()
    expect(await sessionCount(email('active'))).toBe(before)
  })

  it('rejects a correct password on an inactive account with 403 and no session (AC-06, AC-33, BR-07)', async () => {
    const res = await login(email('inactive'))

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('INACTIVE_ACCOUNT')
    expect(cookieOf(res)).toBeUndefined()
    expect(await sessionCount(email('inactive'))).toBe(0)
  })

  it('does not reveal an account is inactive when the password is wrong (BR-06)', async () => {
    const res = await login(email('inactive'), 'WrongPass1!')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it.each([
    ['email', { password: PASSWORD }],
    ['password', { email: email('active') }],
    ['email', { email: '   ', password: PASSWORD }],
    ['password', { email: email('active'), password: 12345 }],
  ])('400 VALIDATION_ERROR naming %s when it is missing or not a string', async (field, body) => {
    const res = await request(app).post('/api/auth/login').send(body)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field })
  })
})

describe('GET /api/auth/me (§1.3)', () => {
  it('returns the caller identity for a valid session (BR-14)', async () => {
    const session = await login(email('active'))
    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader(session))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: session.body.id,
      name: 'Auth Active',
      email: email('active'),
      role: 'REQUESTER',
      mustChangePassword: false,
    })
  })

  it('401 UNAUTHENTICATED with no cookie or an unknown token (AC-08)', async () => {
    const none = await request(app).get('/api/auth/me')
    const bogus = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'tik_session=not-a-real-token')

    for (const res of [none, bogus]) {
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('401 once the session has expired (AC-08, BR-13)', async () => {
    const session = await login(email('expiry'))
    await prisma.session.updateMany({
      where: { user: { email: email('expiry') } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader(session))
    expect(res.status).toBe(401)
  })

  it('401 once the session user has been deactivated (§0.1)', async () => {
    const session = await login(email('deactivated'))
    await prisma.user.update({ where: { email: email('deactivated') }, data: { isActive: false } })

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader(session))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout (§1.2)', () => {
  it('204, deletes the session row, clears the cookie, and the old cookie stops working (AC-07, BR-12)', async () => {
    const session = await login(email('active'))
    const hash = createHash('sha256').update(tokenOf(session)).digest('hex')

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookieHeader(session))

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expect(cookieOf(res)).toMatch(/tik_session=;/)
    expect(await prisma.session.findUnique({ where: { tokenHash: hash } })).toBeNull()

    const replay = await request(app).get('/api/auth/me').set('Cookie', cookieHeader(session))
    expect(replay.status).toBe(401)
  })

  it('401 UNAUTHENTICATED with no valid session', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('POST /api/auth/change-password (§1.4)', () => {
  const change = (cookie: string, body: object) =>
    request(app).post('/api/auth/change-password').set('Cookie', cookie).send(body)

  it('401 UNAUTHENTICATED without a session', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('first-login flow: gate flag is true, bad attempts change nothing, success clears it (AC-02, AC-30, BR-02, BR-11)', async () => {
    const session = await login(email('mustchange'))
    expect(session.body.mustChangePassword).toBe(true)
    const cookie = cookieHeader(session)

    const missing = await change(cookie, { currentPassword: PASSWORD })
    expect(missing.status).toBe(400)
    expect(missing.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'newPassword' })

    const wrongCurrent = await change(cookie, {
      currentPassword: 'WrongPass1!',
      newPassword: NEW_PASSWORD,
    })
    expect(wrongCurrent.status).toBe(401)
    expect(wrongCurrent.body.error.code).toBe('INVALID_CREDENTIALS')

    const weak = await change(cookie, { currentPassword: PASSWORD, newPassword: 'N3wPassw0rd' })
    expect(weak.status).toBe(400)
    expect(weak.body.error).toMatchObject({ code: 'WEAK_PASSWORD', field: 'newPassword' })

    // BR-10: the temporary password itself satisfies the complexity rule, but
    // reusing it would leave the user on the password printed in the README.
    const same = await change(cookie, { currentPassword: PASSWORD, newPassword: PASSWORD })
    expect(same.status).toBe(400)
    expect(same.body.error).toMatchObject({ code: 'WEAK_PASSWORD', field: 'newPassword' })

    const stillGated = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(stillGated.body.mustChangePassword).toBe(true)
    expect((await login(email('mustchange'))).status).toBe(200)

    const ok = await change(cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({
      id: session.body.id,
      name: 'Auth Must Change',
      email: email('mustchange'),
      role: 'REQUESTER',
      mustChangePassword: false,
    })

    // The pre-change token is dead; the fresh one works and the gate is open.
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401)
    const fresh = await request(app).get('/api/auth/me').set('Cookie', cookieHeader(ok))
    expect(fresh.status).toBe(200)
    expect(fresh.body.mustChangePassword).toBe(false)

    // The new password is what is stored now (BR-09).
    expect((await login(email('mustchange'), PASSWORD)).status).toBe(401)
    expect((await login(email('mustchange'), NEW_PASSWORD)).status).toBe(200)
  })

  it('sets no cookie when the change fails to commit, so no client holds a token for a rolled-back row', async () => {
    const session = await login(email('commitfail'))
    const realTransaction = prisma.$transaction.bind(prisma)
    // Run the whole callback, then fail, as a commit error would after it.
    vi.spyOn(prisma, '$transaction').mockImplementationOnce((async (fn: never) => {
      await realTransaction(fn)
      throw new Error('commit failed')
    }) as never)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await change(cookieHeader(session), {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    })
    logged.mockRestore()

    expect(res.status).toBe(500)
    expect(cookieOf(res)).toBeUndefined()
  })

  it('also works as a voluntary change for a user with no gate, leaving one live session', async () => {
    const session = await login(email('voluntary'))
    const ok = await change(cookieHeader(session), {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    })

    expect(ok.status).toBe(200)
    expect(ok.body.mustChangePassword).toBe(false)
    expect(await sessionCount(email('voluntary'))).toBe(1)
  })
})
