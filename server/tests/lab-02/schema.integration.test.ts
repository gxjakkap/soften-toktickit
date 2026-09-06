import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/db.js'

// SCHEMA-01..05 — database-level guarantees for the Lab 2 ticketing schema
// (specification.md §7.1–§7.3). These assert what the DB enforces on its own,
// independent of any route handler or validation layer.

const TAG = 'schema.test.invalid'

let categoryId: number
let relatedSystemId: number
let requesterId: number

async function wipe() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } })
  await prisma.category.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.relatedSystem.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.requesterUser.deleteMany({ where: { email: { contains: TAG } } })
}

function newTicket(overrides: Record<string, unknown> = {}) {
  return {
    ticketNumber: `TKT-2026-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
    requesterId,
    categoryId,
    relatedSystemId,
    requestedPriority: 'MEDIUM' as const,
    summary: `Fixture ticket ${TAG}`,
    description: 'A description long enough to look like a real ticket body.',
    ...overrides,
  }
}

beforeAll(async () => {
  await wipe()
  categoryId = (await prisma.category.create({ data: { name: `Category ${TAG}` } })).id
  relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `System ${TAG}` } })).id
  requesterId = (
    await prisma.requesterUser.create({
      data: { name: 'Schema Fixture', email: `requester.${TAG}` },
    })
  ).id
})

afterAll(wipe)

describe('Ticket constraints', () => {
  it('SCHEMA-01 (BR-01): rejects a duplicate ticketNumber', async () => {
    const ticketNumber = `TKT-2026-999001`
    await prisma.ticket.create({ data: newTicket({ ticketNumber }) })

    await expect(prisma.ticket.create({ data: newTicket({ ticketNumber }) })).rejects.toMatchObject(
      { code: 'P2002' },
    )
  })

  it('SCHEMA-02 (BR-02): defaults currentStatus to NEW and stamps createdAt/updatedAt', async () => {
    const ticket = await prisma.ticket.create({ data: newTicket() })

    expect(ticket.currentStatus).toBe('NEW')
    expect(ticket.createdAt).toBeInstanceOf(Date)
    expect(ticket.updatedAt).toBeInstanceOf(Date)
  })

  it('SCHEMA-03: rejects a ticket whose requester, category or related system does not exist', async () => {
    for (const bad of [{ requesterId: -1 }, { categoryId: -1 }, { relatedSystemId: -1 }]) {
      await expect(prisma.ticket.create({ data: newTicket(bad) })).rejects.toMatchObject({
        code: 'P2003',
      })
    }
  })

  it('SCHEMA-04: required columns are NOT NULL, optional ones are nullable', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name IN ('Ticket', 'Attachment')
    `
    const nullable = Object.fromEntries(columns.map((c) => [c.column_name, c.is_nullable === 'YES']))

    for (const required of ['ticketNumber', 'summary', 'description', 'requesterId', 'categoryId',
      'relatedSystemId', 'requestedPriority', 'currentStatus', 'originalFileName',
      'storedFileName', 'mimeType', 'sizeBytes', 'isRemoved']) {
      expect(nullable[required], `${required} should be NOT NULL`).toBe(false)
    }
    for (const optional of ['removedAt', 'removedReason']) {
      expect(nullable[optional], `${optional} should be nullable`).toBe(true)
    }
  })

  it('SCHEMA-05: indexes exist on the columns My Tickets filters and sorts by', async () => {
    const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'Ticket'
    `
    const defs = indexes.map((i) => i.indexdef).join('\n')

    for (const column of ['requesterId', 'categoryId', 'relatedSystemId', 'currentStatus', 'createdAt']) {
      expect(defs, `expected an index covering ${column}`).toContain(`"${column}"`)
    }
  })
})

describe('delete behaviour', () => {
  it('SCHEMA-06: deleting a ticket cascades to its attachments', async () => {
    const ticket = await prisma.ticket.create({ data: newTicket() })
    const attachment = await prisma.attachment.create({
      data: {
        ticketId: ticket.id,
        originalFileName: 'evidence.pdf',
        storedFileName: `${TAG}-${ticket.id}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      },
    })

    expect(attachment.isRemoved).toBe(false)
    expect(attachment.removedAt).toBeNull()
    expect(attachment.removedReason).toBeNull()

    await prisma.ticket.delete({ where: { id: ticket.id } })

    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).toBeNull()
  })

  it('SCHEMA-07: refuses to delete a category, related system or requester still in use', async () => {
    const ticket = await prisma.ticket.create({ data: newTicket() })

    await expect(prisma.category.delete({ where: { id: categoryId } })).rejects.toMatchObject({
      code: 'P2003',
    })
    await expect(
      prisma.relatedSystem.delete({ where: { id: relatedSystemId } }),
    ).rejects.toMatchObject({ code: 'P2003' })
    await expect(
      prisma.requesterUser.delete({ where: { id: requesterId } }),
    ).rejects.toMatchObject({ code: 'P2003' })

    await prisma.ticket.delete({ where: { id: ticket.id } })
  })
})
