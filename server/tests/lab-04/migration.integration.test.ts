import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// MIG-01..MIG-05 (AC-38, AC-39): specification.md §7.2, §7.4, §7.5. Builds a
// Lab 3 database in a scratch DB, fills it with Lab 3-shaped rows, applies the
// Lab 4 migration under an Asia/Bangkok session, then runs the rollback script
// and re-applies the migration, checking that no Lab 1-3 row changes.

const prismaDir = fileURLToPath(new URL('../../prisma/', import.meta.url))
const LAB4 = '20261007101745_actions_taken_workflow'
const EARLIER = [
  '20260816122445_add_category',
  '20260902174250_add_requester_user',
  '20260903055355_add_ticket_attachment_related_system',
  '20260919100000_users_auth_comments',
]
const migrationSql = (dir: string) =>
  readFileSync(`${prismaDir}migrations/${dir}/migration.sql`, 'utf8')
const rollbackSql = readFileSync(`${prismaDir}rollback/${LAB4}.down.sql`, 'utf8')

const scratchName = `toktickit_lab4_migration_test_${process.pid}`
const withDb = (name: string) => {
  const url = new URL(process.env.DATABASE_URL!)
  url.pathname = `/${name}`
  return url.toString()
}

const LAB3_TABLES = [
  'User',
  'Session',
  'Category',
  'RelatedSystem',
  'Ticket',
  'Attachment',
  'TicketComment',
]

let admin: Client
let db: Client
let lab3Rows: Record<string, unknown[]>
let lab3TicketColumns: string[]

// Every Lab 1-3 table, restricted to its Lab 3 columns, so new columns don't
// count as a change.
async function lab3Snapshot() {
  const out: Record<string, unknown[]> = {}
  for (const table of LAB3_TABLES) {
    const cols = table === 'Ticket' ? lab3TicketColumns.map((c) => `"${c}"`).join(', ') : '*'
    out[table] = (await db.query(`SELECT ${cols} FROM "${table}" ORDER BY id`)).rows
  }
  return out
}

const columnsOf = async (table: string) =>
  (
    await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY column_name`,
      [table],
    )
  ).rows.map((r) => r.column_name as string)

const tableExists = async (table: string) =>
  (await db.query(`SELECT to_regclass($1) AS t`, [`"${table}"`])).rows[0].t !== null

beforeAll(async () => {
  admin = new Client({ connectionString: withDb('postgres') })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS "${scratchName}"`)
  await admin.query(`CREATE DATABASE "${scratchName}"`)

  db = new Client({ connectionString: withDb(scratchName) })
  await db.connect()
  for (const dir of EARLIER) await db.query(migrationSql(dir))

  // The rollback script deletes its own row from Prisma's bookkeeping table.
  await db.query(`CREATE TABLE "_prisma_migrations" (migration_name TEXT NOT NULL)`)

  // Lab 3 state: every role, an owner, Tickets in each status the backfill
  // treats differently, an attachment, a Public Comment, an Internal Note, and
  // a session. updatedAt values are UTC wall-clock, as Prisma writes them.
  await db.query(`
    INSERT INTO "User" (id, name, email, "passwordHash", role, "isActive", "updatedAt") VALUES
      (1, 'Rita Requester', 'rita@example.com', 'h', 'REQUESTER', true, '2026-09-01 00:00:00'),
      (2, 'Sam Staff', 'sam@example.com', 'h', 'IT_STAFF', true, '2026-09-01 00:00:00'),
      (3, 'Ada Admin', 'ada@example.com', 'h', 'ADMINISTRATOR', true, '2026-09-01 00:00:00'),
      (4, 'Ian Inactive', 'ian@example.com', 'h', 'IT_STAFF', false, '2026-09-01 00:00:00');
    SELECT setval('"User_id_seq"', 4);
    INSERT INTO "Session" (id, "tokenHash", "userId", "expiresAt") VALUES (1, 'tok', 1, '2026-12-01 00:00:00');
    INSERT INTO "Category" (id, name) VALUES (1, 'Hardware');
    INSERT INTO "RelatedSystem" (id, name) VALUES (1, 'Printer');
    INSERT INTO "Ticket" (id, "ticketNumber", "requesterId", "ownerId", "categoryId", "relatedSystemId",
      summary, description, "requestedPriority", "itPriority", "currentStatus", "updatedAt") VALUES
      (10, 'TKT-2026-000010', 1, 2, 1, 1, 'Jam', 'Paper stuck.', 'HIGH', 'HIGH', 'IN_PROGRESS', '2026-09-10 08:00:00'),
      (11, 'TKT-2026-000011', 1, 2, 1, 1, 'Toner', 'Replace toner.', 'LOW', 'LOW', 'RESOLVED', '2026-09-11 16:59:59.999'),
      (12, 'TKT-2026-000012', 1, 2, 1, 1, 'Driver', 'Install driver.', 'LOW', 'MEDIUM', 'CLOSED', '2026-09-12 17:00:00'),
      (13, 'TKT-2026-000013', 1, NULL, 1, 1, 'Cable', 'Cable loose.', 'MEDIUM', 'MEDIUM', 'NEW', '2026-09-13 09:00:00'),
      (14, 'TKT-2026-000014', 1, 2, 1, 1, 'Old', 'Not needed.', 'LOW', 'LOW', 'CANCELLED', '2026-09-14 09:00:00'),
      (15, 'TKT-2026-000015', 1, 2, 1, 1, 'Again', 'Came back.', 'LOW', 'LOW', 'REOPENED', '2026-09-15 09:00:00');
    INSERT INTO "Attachment" (id, "ticketId", "originalFileName", "storedFileName", "mimeType", "sizeBytes")
      VALUES (100, 10, 'jam.png', 'stored-jam.png', 'image/png', 2048);
    INSERT INTO "TicketComment" (id, "ticketId", "authorId", visibility, content) VALUES
      (200, 10, 2, 'PUBLIC', 'Looking into it.'),
      (201, 10, 2, 'INTERNAL', 'Probably the roller.');
  `)

  lab3TicketColumns = await columnsOf('Ticket')
  lab3Rows = await lab3Snapshot()

  // MIG-02: run the migration under a non-UTC session, where a plain
  // timestamp -> timestamptz assignment would shift every value by 7 hours.
  await db.query(`SET TIME ZONE 'Asia/Bangkok'`)
  await db.query(migrationSql(LAB4))
  await db.query(`INSERT INTO "_prisma_migrations" (migration_name) VALUES ($1)`, [LAB4])
  await db.query(`SET TIME ZONE 'UTC'`)
}, 60_000)

afterAll(async () => {
  await db?.end()
  await admin?.query(`DROP DATABASE IF EXISTS "${scratchName}"`)
  await admin?.end()
})

describe('Lab 3 -> Lab 4 migration (specification.md §7.4)', () => {
  it('MIG-01: keeps every Lab 1-3 row and id unchanged', async () => {
    expect(await lab3Snapshot()).toEqual(lab3Rows)
  })

  it('MIG-01: every legacy Ticket has version 1, zero Actions Taken, and an empty history', async () => {
    const { rows } = await db.query(`SELECT DISTINCT version FROM "Ticket"`)
    expect(rows).toEqual([{ version: 1 }])
    expect((await db.query(`SELECT count(*)::int AS n FROM "ActionTaken"`)).rows[0].n).toBe(0)
    expect((await db.query(`SELECT count(*)::int AS n FROM "TicketStatusHistory"`)).rows[0].n).toBe(
      0,
    )
  })

  it('MIG-02: resolvedAt = updatedAt read as UTC for Resolved/Closed, NULL otherwise, with no time zone shift', async () => {
    const { rows } = await db.query(
      `SELECT id, to_char("resolvedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') AS r
       FROM "Ticket" ORDER BY id`,
    )
    expect(rows).toEqual([
      { id: 10, r: null },
      { id: 11, r: '2026-09-11 16:59:59.999' },
      { id: 12, r: '2026-09-12 17:00:00.000' },
      { id: 13, r: null },
      { id: 14, r: null },
      { id: 15, r: null },
    ])
  })
})

describe('Lab 4 constraints (specification.md §7.2)', () => {
  const insertAction = (overrides: Record<string, unknown> = {}) => {
    const row = {
      ticketId: 10,
      performedById: 2,
      assignedToId: 2,
      actionAt: '2026-09-10 09:00:00+00',
      description: 'Cleaned the roller.',
      result: null,
      status: 'PLANNED',
      followUpRequired: false,
      followUpNote: null,
      clientRequestId: null,
      version: 1,
      ...overrides,
    }
    const cols = Object.keys(row)
    return db.query(
      `INSERT INTO "ActionTaken" (${cols.map((c) => `"${c}"`).join(', ')}, "updatedAt")
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, now()) RETURNING id`,
      Object.values(row),
    )
  }

  it('MIG-03 (BR-01): an Action Taken cannot exist without a valid Ticket or User', async () => {
    await expect(insertAction({ ticketId: 9999 })).rejects.toMatchObject({ code: '23503' })
    await expect(insertAction({ ticketId: null })).rejects.toMatchObject({ code: '23502' })
    await expect(insertAction({ performedById: 9999 })).rejects.toMatchObject({ code: '23503' })
    await expect(insertAction({ assignedToId: 9999 })).rejects.toMatchObject({ code: '23503' })
  })

  it('MIG-03: CHECKs reject follow-up without note, Done without result, blank description, version 0', async () => {
    const check = { code: '23514' }
    await expect(insertAction({ followUpRequired: true })).rejects.toMatchObject(check)
    await expect(
      insertAction({ followUpRequired: true, followUpNote: '   ' }),
    ).rejects.toMatchObject(check)
    await expect(insertAction({ status: 'DONE' })).rejects.toMatchObject(check)
    await expect(insertAction({ status: 'DONE', result: ' ' })).rejects.toMatchObject(check)
    await expect(insertAction({ description: '  ' })).rejects.toMatchObject(check)
    await expect(insertAction({ version: 0 })).rejects.toMatchObject(check)
    await expect(db.query(`UPDATE "Ticket" SET version = 0 WHERE id = 10`)).rejects.toMatchObject(
      check,
    )
    await expect(insertAction({ status: 'FINISHED' })).rejects.toMatchObject({ code: '22P02' })
  })

  it('MIG-03 (§7.3-5, §7.3-6): Restrict blocks deleting a Ticket or User with Actions/history; clientRequestId is unique per user', async () => {
    const key = '6f1c2a8e-3b7d-4f4e-9a51-2c0d7b9e8f10'
    await insertAction({ clientRequestId: key })
    await expect(insertAction({ clientRequestId: key })).rejects.toMatchObject({ code: '23505' })
    // Another user may reuse the key, and NULL keys never collide.
    await insertAction({ clientRequestId: key, performedById: 3 })
    await insertAction()
    await insertAction()

    await db.query(
      `INSERT INTO "TicketStatusHistory" ("ticketId", "fromStatus", "toStatus", "changedById")
       VALUES (13, NULL, 'NEW', 1)`,
    )
    await expect(db.query(`DELETE FROM "Ticket" WHERE id = 10`)).rejects.toMatchObject({
      code: '23503',
    })
    await expect(db.query(`DELETE FROM "Ticket" WHERE id = 13`)).rejects.toMatchObject({
      code: '23503',
    })
    await expect(db.query(`DELETE FROM "User" WHERE id = 3`)).rejects.toMatchObject({
      code: '23503',
    })
  })

  it('MIG-04 (§7.3-4): every index in §7.2 exists', async () => {
    const { rows } = await db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename IN ('Ticket', 'ActionTaken', 'TicketStatusHistory')`,
    )
    expect(rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining([
        'ActionTaken_performedById_clientRequestId_key',
        'ActionTaken_ticketId_actionAt_id_idx',
        'ActionTaken_assignedToId_status_idx',
        'ActionTaken_ticketId_status_followUpRequired_idx',
        'TicketStatusHistory_ticketId_changedAt_id_idx',
        'Ticket_currentStatus_ownerId_idx',
        'Ticket_currentStatus_itPriority_idx',
        'Ticket_resolvedAt_idx',
        'Ticket_requesterId_currentStatus_idx',
        'Ticket_updatedAt_idx',
      ]),
    )
  })
})

describe('Rollback and re-apply (specification.md §7.5)', () => {
  it('MIG-05 (AC-39): the down script restores the Lab 3 schema with every Lab 1-3 row intact', async () => {
    await db.query(rollbackSql)

    expect(await columnsOf('Ticket')).toEqual(lab3TicketColumns)
    expect(await tableExists('ActionTaken')).toBe(false)
    expect(await tableExists('TicketStatusHistory')).toBe(false)
    expect((await db.query(`SELECT to_regtype('"ActionStatus"') AS t`)).rows[0].t).toBeNull()
    const { rows: idx } = await db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'Ticket' AND indexname IN
        ('Ticket_currentStatus_ownerId_idx', 'Ticket_currentStatus_itPriority_idx',
         'Ticket_resolvedAt_idx', 'Ticket_requesterId_currentStatus_idx', 'Ticket_updatedAt_idx')`,
    )
    expect(idx).toEqual([])
    expect((await db.query(`SELECT count(*)::int AS n FROM "_prisma_migrations"`)).rows[0].n).toBe(
      0,
    )
    expect(await lab3Snapshot()).toEqual(lab3Rows)
  })

  it('MIG-05 (AC-39): the forward migration re-applies cleanly afterward and still preserves every row', async () => {
    await db.query(migrationSql(LAB4))
    expect(await lab3Snapshot()).toEqual(lab3Rows)
    expect(
      (await db.query(`SELECT count(*)::int AS n FROM "Ticket" WHERE version = 1`)).rows[0].n,
    ).toBe(6)
    expect((await db.query(`SELECT count(*)::int AS n FROM "ActionTaken"`)).rows[0].n).toBe(0)
  })
})
