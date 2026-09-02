import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'

// API-24 (AC-22, BR-09): GET /api/dev-requesters returns only active
// requesters, ordered by name ascending.
//
// Fixture rows are created and removed by this file so the assertions don't
// depend on whatever the seed happens to have left in the dev database.
const fixtures = [
  { name: 'Zzz Fixture Active', email: 'zzz.fixture.active@test.invalid', isActive: true },
  { name: 'Aaa Fixture Active', email: 'aaa.fixture.active@test.invalid', isActive: true },
  { name: 'Mmm Fixture Inactive', email: 'mmm.fixture.inactive@test.invalid', isActive: false },
]

const emails = fixtures.map((f) => f.email)

beforeAll(async () => {
  await prisma.requesterUser.deleteMany({ where: { email: { in: emails } } })
  for (const fixture of fixtures) {
    await prisma.requesterUser.create({ data: fixture })
  }
})

afterAll(async () => {
  await prisma.requesterUser.deleteMany({ where: { email: { in: emails } } })
})

describe('GET /api/dev-requesters', () => {
  it('returns only active requesters', async () => {
    const res = await request(app).get('/api/dev-requesters')

    expect(res.status).toBe(200)
    const returnedEmails = res.body.map((r: { email: string }) => r.email)
    expect(returnedEmails).toContain('aaa.fixture.active@test.invalid')
    expect(returnedEmails).toContain('zzz.fixture.active@test.invalid')
    expect(returnedEmails).not.toContain('mmm.fixture.inactive@test.invalid')
  })

  it('orders requesters by name ascending', async () => {
    const res = await request(app).get('/api/dev-requesters')

    const names = res.body.map((r: { name: string }) => r.name)
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)))
  })

  it('exposes id, name and email but never the isActive flag', async () => {
    const res = await request(app).get('/api/dev-requesters')

    const row = res.body.find(
      (r: { email: string }) => r.email === 'aaa.fixture.active@test.invalid',
    )
    expect(row).toMatchObject({ name: 'Aaa Fixture Active', email: 'aaa.fixture.active@test.invalid' })
    expect(typeof row.id).toBe('number')
    expect(Object.keys(row).sort()).toEqual(['email', 'id', 'name'])
  })
})
