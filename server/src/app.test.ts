import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from './app.js'
import { prisma } from './db.js'

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'TokTickIT API' })
  })
})

describe('GET /api/categories', () => {
  it('returns all categories ordered by id ascending', async () => {
    const expected = await prisma.category.findMany({ orderBy: { id: 'asc' } })

    const res = await request(app).get('/api/categories')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(JSON.parse(JSON.stringify(expected)))
    expect(res.body.map((category: { id: number }) => category.id)).toEqual(
      expected.map((category) => category.id).sort((a, b) => a - b),
    )
  })
})
