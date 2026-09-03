import type { Request } from 'express'
import { prisma } from '../db.js'

// The single "who is asking?" seam (specification.md §11-1, BR-31): every
// requester-scoped route resolves the current requester through this file
// instead of reading req.query/req.body directly, so Lab 3 only has to
// change this module, not every call site.

export function extractRequesterId(req: Request): unknown {
  return req.method === 'GET' ? req.query.requesterId : req.body?.requesterId
}

export function parseRequesterId(raw: unknown): number | null {
  const id = typeof raw === 'string' ? Number(raw) : raw
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null
}

export async function resolveActiveRequester(req: Request) {
  const id = parseRequesterId(extractRequesterId(req))
  if (id === null) return null
  const requester = await prisma.requesterUser.findUnique({ where: { id } })
  return requester?.isActive ? requester : null
}
