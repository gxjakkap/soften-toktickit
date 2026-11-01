import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'

// Lab 4 (docs/lab-04/tests.md §6): FR-22 adds the database probe, so the
// 200 body also carries database: 'ok'. status and service are unchanged.
describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'TokTickIT API', database: 'ok' })
  })
})
