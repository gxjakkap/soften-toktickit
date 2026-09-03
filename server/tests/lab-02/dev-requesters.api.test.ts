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

// API-25 (FR-02 ref data): GET /api/categories and GET /api/related-systems
// return only active rows, as {id, name} (no isActive/createdAt leaked).
const categoryFixtures = [
  { name: 'Fixture Active Category', isActive: true },
  { name: 'Fixture Inactive Category', isActive: false },
]
const relatedSystemFixtures = [
  { name: 'Fixture Active System', isActive: true },
  { name: 'Fixture Inactive System', isActive: false },
]
const categoryNames = categoryFixtures.map((f) => f.name)
const relatedSystemNames = relatedSystemFixtures.map((f) => f.name)

beforeAll(async () => {
  await prisma.category.deleteMany({ where: { name: { in: categoryNames } } })
  for (const fixture of categoryFixtures) {
    await prisma.category.create({ data: fixture })
  }
  await prisma.relatedSystem.deleteMany({ where: { name: { in: relatedSystemNames } } })
  for (const fixture of relatedSystemFixtures) {
    await prisma.relatedSystem.create({ data: fixture })
  }
})

afterAll(async () => {
  await prisma.category.deleteMany({ where: { name: { in: categoryNames } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { in: relatedSystemNames } } })
})

describe('GET /api/categories', () => {
  it('API-25: returns only active categories, as {id, name}', async () => {
    const res = await request(app).get('/api/categories')

    expect(res.status).toBe(200)
    const names = res.body.map((c: { name: string }) => c.name)
    expect(names).toContain('Fixture Active Category')
    expect(names).not.toContain('Fixture Inactive Category')

    const row = res.body.find((c: { name: string }) => c.name === 'Fixture Active Category')
    expect(Object.keys(row).sort()).toEqual(['id', 'name'])
  })
})

describe('GET /api/related-systems', () => {
  it('API-25: returns only active related systems, as {id, name}', async () => {
    const res = await request(app).get('/api/related-systems')

    expect(res.status).toBe(200)
    const names = res.body.map((s: { name: string }) => s.name)
    expect(names).toContain('Fixture Active System')
    expect(names).not.toContain('Fixture Inactive System')

    const row = res.body.find((s: { name: string }) => s.name === 'Fixture Active System')
    expect(Object.keys(row).sort()).toEqual(['id', 'name'])
  })
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
