import express from 'express'
import { prisma } from './db.js'

export const app = express()

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TokTickIT API' })
})

app.get('/api/categories', async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { id: 'asc' } })
  res.json(categories)
})

// Lab 2 testing identities, not authentication (BR-03). Only active rows,
// ordered by name (BR-09); isActive is never exposed to the client.
app.get('/api/dev-requesters', async (_req, res) => {
  const requesters = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  })
  res.json(requesters)
})

// Standard error envelope (api-spec.md §0.2). Never leaks internals.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  })
})
