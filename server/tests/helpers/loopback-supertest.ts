import { createServer } from 'node:http'
import { vi } from 'vitest'

// Test infrastructure, not app behavior (docs/lab-04/tests.md §7, flakiness
// fixes). `request(app)` makes supertest call `server.listen(0)`, which binds
// a random port on every interface (`::`), and then dial `127.0.0.1:<port>`.
// macOS can hand out a port that another local process already holds on
// 127.0.0.1 alone, so the request reaches that process instead of the app: a
// stray 401, 426, or HTTP parse error in a random test. Here `request(app)`
// goes to one server bound to 127.0.0.1, where the OS only picks a free port.
// Assertions are untouched; only the socket the request travels on changes.
vi.mock('supertest', async (importOriginal) => {
  const { default: request, ...rest } = await importOriginal<typeof import('supertest')>()
  const { app } = await import('../../src/app.js')
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  server.unref()
  const loopbackRequest = ((target: Parameters<typeof request>[0], options?: object) =>
    request(target === app ? server : target, options)) as typeof request
  return { ...rest, default: Object.assign(loopbackRequest, rest) }
})
