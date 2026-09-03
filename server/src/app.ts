import { randomUUID } from 'node:crypto'
import express from 'express'
import { prisma } from './db.js'
import { formatTicketNumber } from './lib/ticket-number.js'
import { resolveActiveRequester } from './lib/requester-context.js'

export const app = express()

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TokTickIT API' })
})

// Only active rows, {id, name} shape (api-spec.md §2). isActive/createdAt
// are never exposed to the client.
app.get('/api/categories', async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
  res.json(categories)
})

// Mirrors /api/categories (api-spec.md §3).
app.get('/api/related-systems', async (_req, res) => {
  const relatedSystems = await prisma.relatedSystem.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
  res.json(relatedSystems)
})

const SUMMARY_MIN = 5
const SUMMARY_MAX = 120
const DESCRIPTION_MIN = 10
const DESCRIPTION_MAX = 2000
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH']

// api-spec.md §4 (FR-02, FR-03, BR-01, BR-02, BR-07, BR-08, BR-20, BR-21).
app.post('/api/tickets', async (req, res) => {
  const requester = await resolveActiveRequester(req)
  if (!requester) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUESTER',
        message: 'Requester is missing, unknown, or inactive.',
      },
    })
  }

  const summary = typeof req.body.summary === 'string' ? req.body.summary.trim() : ''
  if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Summary must be between ${SUMMARY_MIN} and ${SUMMARY_MAX} characters.`,
        field: 'summary',
      },
    })
  }

  const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`,
        field: 'description',
      },
    })
  }

  const requestedPriority = req.body.requestedPriority
  if (!PRIORITIES.includes(requestedPriority)) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Requested priority must be LOW, MEDIUM, or HIGH.',
        field: 'requestedPriority',
      },
    })
  }

  const categoryId = Number(req.body.categoryId)
  const category = Number.isInteger(categoryId)
    ? await prisma.category.findUnique({ where: { id: categoryId } })
    : null
  if (!category?.isActive) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REFERENCE',
        message: 'Category is invalid or inactive.',
        field: 'categoryId',
      },
    })
  }

  const relatedSystemId = Number(req.body.relatedSystemId)
  const relatedSystem = Number.isInteger(relatedSystemId)
    ? await prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } })
    : null
  if (!relatedSystem?.isActive) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REFERENCE',
        message: 'Related System is invalid or inactive.',
        field: 'relatedSystemId',
      },
    })
  }

  // ticketNumber depends on the row's own id (BR-06), so it's set with a
  // placeholder that still satisfies the unique constraint, then updated in
  // the same transaction once the real id is known.
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        ticketNumber: `PENDING-${randomUUID()}`,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        requestedPriority,
        summary,
        description,
      },
    })
    return tx.ticket.update({
      where: { id: created.id },
      data: { ticketNumber: formatTicketNumber(created.id, created.createdAt.getFullYear()) },
    })
  })

  res.status(201).json(ticket)
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
