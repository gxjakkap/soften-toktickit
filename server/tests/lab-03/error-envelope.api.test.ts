import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'

// PR #49 review: express.json() itself rejects malformed/oversized bodies
// before any route handler runs; api-spec.md §0.3 requires those to stay 4xx.
describe('errorEnvelope wired into the app (api-spec.md §0.2, §0.3)', () => {
  it('a malformed JSON body is rejected as 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      error: { code: 'MALFORMED_REQUEST', message: 'The request could not be read.' },
    })
  })
})
