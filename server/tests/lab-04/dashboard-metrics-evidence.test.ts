// EVID-01 (tests.md §2.2); AC-28, AC-02, AC-33.
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db.js'
import { loginCookie } from '../helpers/auth.js'

// Lab 4 specification.md §5.6 (BR-39..BR-55), grading Part 5: on the seeded
// database, every dashboard value equals an independent raw SQL query. The
// SQL below restates each BR definition directly against the tables. It
// shares no code with the handlers (no Prisma filters, no bangkok-time.ts),
// so a wrong handler can't make its own check pass.
//
// The table printed at the end is the screenshot evidence. Run this file on
// its own to read it: pnpm --filter server exec vitest run
// tests/lab-04/dashboard-metrics-evidence.test.ts

const STAFF = 'sarah.johnson@example.com'
const REQUESTER = 'jennifer.anderson@example.com'
const ADMIN = 'alex.morgan@example.com'

const ACTIVE = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`
// 00:00 Asia/Bangkok today, as a timestamptz (BR-34).
const BKK_TODAY = `(date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`

type Row = { metric: string; sql: string; expected: string; api: string }
const rows: Row[] = []

let staff: { id: number; body: any }
let requester: { id: number; body: any }
let admin: { body: any }

async function sqlValue(sql: string): Promise<string> {
  const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql)
  const values = result.map((r) => Object.values(r)[0])
  const shown = values.map((v) => (typeof v === 'bigint' ? Number(v) : v))
  return JSON.stringify(shown.length === 1 && !sql.includes('-- list') ? shown[0] : shown)
}

async function check(metric: string, sql: string, apiValue: unknown) {
  const oneLine = sql.replace(/\s+/g, ' ').trim()
  const expected = await sqlValue(sql)
  const api = JSON.stringify(apiValue)
  rows.push({ metric, sql: oneLine.replace(' -- list', ''), expected, api })
  expect(api, metric).toBe(expected)
}

async function dashboardFor(email: string, path: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  const cookie = await loginCookie(app, email)
  const res = await request(app).get(path).set('Cookie', cookie)
  expect(res.status).toBe(200)
  return { id: user.id, body: res.body }
}

beforeAll(async () => {
  staff = await dashboardFor(STAFF, '/api/dashboard/staff')
  requester = await dashboardFor(REQUESTER, '/api/dashboard/requester')
  admin = await dashboardFor(ADMIN, '/api/dashboard/staff')
})

describe('EVID-01: IT Staff Dashboard equals raw SQL (Sarah Johnson, seeded)', () => {
  it('cards BR-45..BR-50', async () => {
    const m = staff.body.metrics
    const me = staff.id
    const myOpen = `FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
      WHERE a."assignedToId" = ${me} AND a.status IN ('PLANNED','IN_PROGRESS')
      AND t."currentStatus" IN ${ACTIVE}`
    await check('BR-45 My Open Actions', `SELECT count(*) ${myOpen}`, m.myOpenActions.value)
    await check(
      'BR-45 My Open Actions: across N tickets',
      `SELECT count(DISTINCT a."ticketId") ${myOpen}`,
      m.myOpenActions.ticketCount,
    )
    await check(
      'BR-46 Unassigned',
      `SELECT count(*) FROM "Ticket" WHERE "ownerId" IS NULL AND "currentStatus" IN ${ACTIVE}`,
      m.unassigned.value,
    )
    await check(
      'BR-47 My Active Tickets',
      `SELECT count(*) FROM "Ticket" WHERE "ownerId" = ${me} AND "currentStatus" IN ${ACTIVE}`,
      m.myActiveTickets.value,
    )
    await check(
      'BR-48 Follow-Ups Pending',
      `SELECT count(*) FROM "Ticket" t WHERE t."currentStatus" IN ${ACTIVE} AND EXISTS (
        SELECT 1 FROM "ActionTaken" a WHERE a."ticketId" = t.id
        AND a.status <> 'CANCELLED' AND a."followUpRequired")`,
      m.followUpsPending.value,
    )
    await check(
      'BR-49 High Priority',
      `SELECT count(*) FROM "Ticket" WHERE "itPriority" = 'HIGH' AND "currentStatus" IN ${ACTIVE}`,
      m.highPriority.value,
    )
    await check(
      'BR-50 Resolved Today',
      `SELECT count(*) FROM "Ticket" WHERE "resolvedAt" >= ${BKK_TODAY}
        AND "resolvedAt" < ${BKK_TODAY} + interval '1 day'`,
      m.resolvedToday.value,
    )
  })

  it('breakdowns BR-51, BR-52', async () => {
    for (const entry of staff.body.byStatus) {
      await check(
        `BR-51 Tickets by Status: ${entry.status}`,
        `SELECT count(*) FROM "Ticket" WHERE "currentStatus" = '${entry.status}'`,
        entry.value,
      )
    }
    for (const entry of staff.body.activeByItPriority) {
      await check(
        `BR-52 Active by IT Priority: ${entry.itPriority}`,
        `SELECT count(*) FROM "Ticket" WHERE "itPriority" = '${entry.itPriority}'
          AND "currentStatus" IN ${ACTIVE}`,
        entry.value,
      )
    }
  })

  it('lists BR-53, BR-54 (ids, in order)', async () => {
    await check(
      'BR-53 My Open Actions list (action ids)',
      `SELECT a.id FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
        WHERE a."assignedToId" = ${staff.id} AND a.status IN ('PLANNED','IN_PROGRESS')
        AND t."currentStatus" IN ${ACTIVE} ORDER BY a."actionAt", a.id LIMIT 5 -- list`,
      staff.body.myOpenActionList.map((a: { actionId: number }) => a.actionId),
    )
    await check(
      'BR-54 Recently Updated (ticket ids)',
      `SELECT id FROM "Ticket" ORDER BY "updatedAt" DESC, id DESC LIMIT 5 -- list`,
      staff.body.recentlyUpdated.map((t: { id: number }) => t.id),
    )
  })

  it('Administrator user counts BR-55 (Alex Morgan); absent for IT Staff', async () => {
    expect(staff.body).not.toHaveProperty('userAccounts')
    for (const role of ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']) {
      for (const active of [true, false]) {
        await check(
          `BR-55 User Accounts: ${role} ${active ? 'active' : 'inactive'}`,
          `SELECT count(*) FROM "User" WHERE role = '${role}' AND "isActive" = ${active}`,
          admin.body.userAccounts[role][active ? 'active' : 'inactive'],
        )
      }
    }
  })
})

describe('EVID-01: Requester Dashboard equals raw SQL (Jennifer Anderson, seeded)', () => {
  it('cards and lists BR-39..BR-44', async () => {
    const me = requester.id
    const m = requester.body.metrics
    await check(
      'BR-40 hasAnyTickets',
      `SELECT count(*) > 0 FROM "Ticket" WHERE "requesterId" = ${me}`,
      requester.body.hasAnyTickets,
    )
    await check(
      'BR-39 Open Tickets',
      `SELECT count(*) FROM "Ticket" WHERE "requesterId" = ${me} AND "currentStatus" IN ${ACTIVE}`,
      m.openTickets.value,
    )
    await check(
      'BR-41 Waiting for You',
      `SELECT count(*) FROM "Ticket" WHERE "requesterId" = ${me}
        AND "currentStatus" = 'WAITING_FOR_REQUESTER'`,
      m.waitingForYou.value,
    )
    await check(
      'BR-42 Resolved (Last 30 Days)',
      `SELECT count(*) FROM "Ticket" WHERE "requesterId" = ${me}
        AND "resolvedAt" >= ${BKK_TODAY} - interval '29 days'`,
      m.resolvedLast30Days.value,
    )
    await check(
      'BR-42 window start (Bangkok date)',
      `SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok' - interval '29 days', 'YYYY-MM-DD')`,
      m.resolvedLast30Days.windowStart,
    )
    await check(
      'BR-43 Recently Updated (ticket ids)',
      `SELECT id FROM "Ticket" WHERE "requesterId" = ${me}
        ORDER BY "updatedAt" DESC, id DESC LIMIT 5 -- list`,
      requester.body.recentlyUpdated.map((t: { id: number }) => t.id),
    )
    await check(
      'BR-44 Recently Resolved (ticket ids)',
      `SELECT id FROM "Ticket" WHERE "requesterId" = ${me} AND "resolvedAt" IS NOT NULL
        ORDER BY "resolvedAt" DESC, id DESC LIMIT 5 -- list`,
      requester.body.recentlyResolved.map((t: { id: number }) => t.id),
    )
  })
})

describe('EVID-01: evidence table', () => {
  it('prints every metric with its SQL, expected value, and API value', () => {
    const w = (key: keyof Row) => Math.max(key.length, ...rows.map((r) => r[key].length))
    const cols: (keyof Row)[] = ['metric', 'expected', 'api', 'sql']
    const head = { metric: 'Metric', expected: 'Expected (SQL)', api: 'API value', sql: 'SQL' }
    const line = (r: Record<keyof Row, string>) =>
      `| ${cols.map((c) => r[c].padEnd(Math.max(w(c), head[c].length))).join(' | ')} |`
    const out = [
      '',
      `Dashboard metric evidence (staff: ${STAFF}, requester: ${REQUESTER}, admin: ${ADMIN})`,
      `API generatedAt: ${staff.body.generatedAt}`,
      line(head),
      `| ${cols.map((c) => '-'.repeat(Math.max(w(c), head[c].length))).join(' | ')} |`,
      ...rows.map((r) => line(r)),
      `${rows.length} values checked, ${rows.filter((r) => r.expected === r.api).length} match.`,
      '',
    ].join('\n')
    process.stdout.write(out)
    expect(rows.length).toBeGreaterThan(30)
    expect(rows.every((r) => r.expected === r.api)).toBe(true)
  })
})
