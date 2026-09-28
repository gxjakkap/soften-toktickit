import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'

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
