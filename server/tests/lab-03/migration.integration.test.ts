import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Issue #2, no API-nn/UI-nn/AC-nn: pure data-layer coverage of specification.md
// §8.3 (BR-09, BR-15, BR-21, BR-23). Builds a Lab 2 database in a scratch DB,
// fills it with Lab 2 rows, applies the Lab 3 migration, and checks nothing was lost.

const migrationsDir = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url))
const LAB3 = '20260919100000_users_auth_comments'
const LAB2 = [
  '20260816122445_add_category',
  '20260902174250_add_requester_user',
  '20260903055355_add_ticket_attachment_related_system',
]
const sql = (dir: string) => readFileSync(`${migrationsDir}${dir}/migration.sql`, 'utf8')

const scratchName = `toktickit_migration_test_${process.pid}`
const withDb = (name: string) => {
  const url = new URL(process.env.DATABASE_URL!)
  url.pathname = `/${name}`
  return url.toString()
}

let admin: Client
let db: Client

beforeAll(async () => {
  admin = new Client({ connectionString: withDb('postgres') })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS "${scratchName}"`)
  await admin.query(`CREATE DATABASE "${scratchName}"`)

  db = new Client({ connectionString: withDb(scratchName) })
  await db.connect()
  for (const dir of LAB2) await db.query(sql(dir))

  // Lab 2 state: two dev requesters (one inactive, one with an upper-case email),
  // tickets in PENDING and CANCELLED, one attachment.
  await db.query(`
    INSERT INTO "RequesterUser" (name, email, "isActive") VALUES
      ('Ada Active', 'Ada.Active@Example.com', true),
      ('Ivan Inactive', 'ivan.inactive@example.com', false);
    INSERT INTO "Category" (id, name) VALUES (1, 'Hardware');
    INSERT INTO "RelatedSystem" (id, name) VALUES (1, 'Printer');
    INSERT INTO "Ticket" (id, "ticketNumber", "requesterId", "categoryId", "relatedSystemId",
      summary, description, "requestedPriority", "currentStatus", "updatedAt") VALUES
      (10, 'TKT-2026-000010', 1, 1, 1, 'Printer jam', 'Paper is stuck.', 'HIGH', 'PENDING', now()),
      (11, 'TKT-2026-000011', 1, 1, 1, 'Old request', 'No longer needed.', 'LOW', 'CANCELLED', now()),
      (12, 'TKT-2026-000012', 2, 1, 1, 'Toner low', 'Replace toner.', 'MEDIUM', 'NEW', now());
    INSERT INTO "Attachment" (id, "ticketId", "originalFileName", "storedFileName", "mimeType", "sizeBytes")
      VALUES (100, 10, 'jam.png', 'stored-jam.png', 'image/png', 2048);
  `)

  await db.query(sql(LAB3))
}, 60_000)

afterAll(async () => {
  await db?.end()
  await admin?.query(`DROP DATABASE IF EXISTS "${scratchName}"`)
  await admin?.end()
})

describe('Lab 2 -> Lab 3 migration (specification.md §8.3)', () => {
  it('keeps every requester row and id, as a REQUESTER who must change password', async () => {
    const { rows } = await db.query(
      `SELECT id, name, "isActive", role, "mustChangePassword" FROM "User" ORDER BY id`,
    )
    expect(rows).toEqual([
      { id: 1, name: 'Ada Active', isActive: true, role: 'REQUESTER', mustChangePassword: true },
      {
        id: 2,
        name: 'Ivan Inactive',
        isActive: false,
        role: 'REQUESTER',
        mustChangePassword: true,
      },
    ])
  })

  it('BR-09: backfilled passwords are bcrypt hashes of the documented dev password, never plaintext', async () => {
    const { rows } = await db.query(`SELECT "passwordHash" FROM "User"`)
    for (const { passwordHash } of rows) {
      expect(passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/)
      expect(passwordHash).not.toContain('DevPass123!')
      expect(await bcrypt.compare('DevPass123!', passwordHash)).toBe(true)
    }
  })

  it('BR-15: emails are lower-cased and the DB rejects a mixed-case email', async () => {
    const { rows } = await db.query(`SELECT email FROM "User" WHERE id = 1`)
    expect(rows[0].email).toBe('ada.active@example.com')

    await expect(
      db.query(`INSERT INTO "User" (name, email, "passwordHash", role, "updatedAt")
                VALUES ('X', 'Mixed@Example.com', 'h', 'REQUESTER', now())`),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('preserves every Ticket and Attachment row, and requesterId still resolves to a User', async () => {
    const tickets = await db.query(`SELECT id, "requesterId" FROM "Ticket" ORDER BY id`)
    expect(tickets.rows).toEqual([
      { id: 10, requesterId: 1 },
      { id: 11, requesterId: 1 },
      { id: 12, requesterId: 2 },
    ])

    const joined = await db.query(
      `SELECT count(*)::int AS n FROM "Ticket" t JOIN "User" u ON u.id = t."requesterId"`,
    )
    expect(joined.rows[0].n).toBe(3)

    const attachments = await db.query(
      `SELECT id, "ticketId", "originalFileName" FROM "Attachment"`,
    )
    expect(attachments.rows).toEqual([{ id: 100, ticketId: 10, originalFileName: 'jam.png' }])
  })

  it('BR-21: itPriority is backfilled from requestedPriority; ownerId and resolved signal are null', async () => {
    const { rows } = await db.query(
      `SELECT "requestedPriority", "itPriority", "ownerId", "requesterConfirmedResolvedAt" FROM "Ticket"`,
    )
    for (const row of rows) {
      expect(row.itPriority).toBe(row.requestedPriority)
      expect(row.ownerId).toBeNull()
      expect(row.requesterConfirmedResolvedAt).toBeNull()
    }
  })

  it('BR-23: PENDING becomes WAITING_FOR_REQUESTER, other statuses are untouched', async () => {
    const { rows } = await db.query(`SELECT id, "currentStatus" FROM "Ticket" ORDER BY id`)
    expect(rows.map((r) => r.currentStatus)).toEqual(['WAITING_FOR_REQUESTER', 'CANCELLED', 'NEW'])
  })

  it('BR-23: enum order puts REOPENED between CLOSED and CANCELLED', async () => {
    const { rows } = await db.query(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = '"TicketStatus"'::regtype ORDER BY enumsortorder`,
    )
    expect(rows.map((r) => r.enumlabel)).toEqual([
      'NEW',
      'OPEN',
      'IN_PROGRESS',
      'WAITING_FOR_REQUESTER',
      'RESOLVED',
      'CLOSED',
      'REOPENED',
      'CANCELLED',
    ])
  })

  it('new users keep getting fresh ids after the migrated rows (sequence survives the rename)', async () => {
    const { rows } = await db.query(
      `INSERT INTO "User" (name, email, "passwordHash", role, "updatedAt")
       VALUES ('New Staff', 'new.staff@example.com', 'h', 'IT_STAFF', now()) RETURNING id`,
    )
    expect(rows[0].id).toBeGreaterThan(2)
  })
})
