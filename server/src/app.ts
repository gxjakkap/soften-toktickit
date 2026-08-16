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
