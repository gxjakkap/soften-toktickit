import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { hashPassword } from '../../src/lib/password.js'
import { loginCookie } from '../helpers/auth.js'

// API-55 (AC-44, BR-15): docs/lab-04 api-spec.md §0.2. A route id past
// Postgres' Int4 range answers exactly like any other id that names no row,
// instead of a 500 from Prisma.

const TAG = 'lab4.route-ids.test.invalid'
const PASSWORD = 'DevPass123!'
const email = (name: string) => `${name}@${TAG}`
const cookies = { requester: '', staff: '', admin: '' }

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD)
  const make = (name: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') =>
    prisma.user.create({
      data: { name: `Route Ids ${name}`, email: email(name), role, passwordHash },
    })
  await Promise.all([
    make('requester', 'REQUESTER'),
    make('staff', 'IT_STAFF'),
    make('admin', 'ADMINISTRATOR'),
  ])
  cookies.requester = await loginCookie(app, email('requester'), PASSWORD)
  cookies.staff = await loginCookie(app, email('staff'), PASSWORD)
  cookies.admin = await loginCookie(app, email('admin'), PASSWORD)
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } })
})

const BIG = '2147483648'
type Method = 'get' | 'post' | 'patch'
// Bodies are valid so each request gets past validation to the lookup.
const routes: [Method, string, keyof typeof cookies, object?][] = [
  ['get', `/api/tickets/${BIG}`, 'requester'],
  ['get', `/api/tickets/${BIG}/actions`, 'requester'],
  ['get', `/api/tickets/${BIG}/status-history`, 'requester'],
  ['post', `/api/tickets/${BIG}/comments`, 'requester', { content: 'Still broken.' }],
  ['patch', `/api/tickets/${BIG}/resolved`, 'requester'],
  ['post', `/api/tickets/${BIG}/attachments`, 'requester'],
  ['get', `/api/attachments/${BIG}/download`, 'requester'],
  ['patch', `/api/attachments/${BIG}/remove`, 'requester', { reason: 'Wrong file' }],
  ['get', `/api/staff/tickets/${BIG}`, 'staff'],
  ['get', `/api/staff/tickets/${BIG}/actions`, 'staff'],
  ['get', `/api/staff/tickets/${BIG}/status-history`, 'staff'],
  [
    'post',
    `/api/staff/tickets/${BIG}/comments`,
    'staff',
    { content: 'Checking.', visibility: 'PUBLIC' },
  ],
  ['patch', `/api/staff/tickets/${BIG}/claim`, 'staff', { version: 1 }],
  ['patch', `/api/staff/tickets/${BIG}/owner`, 'staff', { version: 1, ownerId: 1 }],
  ['patch', `/api/staff/tickets/${BIG}/priority`, 'staff', { version: 1, itPriority: 'LOW' }],
  ['patch', `/api/staff/tickets/${BIG}/status`, 'staff', { version: 1, status: 'OPEN' }],
  ['patch', `/api/admin/users/${BIG}`, 'admin', { name: 'Nobody' }],
]

describe('API-55: out-of-range route ids are not found, not a server error', () => {
  it.each(routes)('%s %s', async (method, url, role, body) => {
    const res = await request(app)
      [method](url)
      .set('Cookie', cookies[role])
      .send(body ?? {})
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
