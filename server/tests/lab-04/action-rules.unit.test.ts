// UNIT-02, UNIT-03, UNIT-04 (tests.md §2.1); AC-04, AC-09, AC-10, AC-11.
import { describe, expect, it } from 'vitest'
import type { ActionStatus } from '../../src/generated/prisma/client.js'
import {
  type ActionFields,
  actionRuleViolation,
  canTransitionAction,
  lockedFieldChanged,
  newAction,
  parseActionBody,
  resolveAction,
} from '../../src/lib/action-rules.js'

// Lab 4 specification.md §5.1 (BR-05..BR-09): the pure Action Taken rules
// behind api-spec.md §2.2 and §2.3.

const STATUSES: ActionStatus[] = ['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const NOW = new Date('2026-10-06T07:00:00.000Z')

const base = (overrides: Partial<ActionFields> = {}): ActionFields => ({
  actionAt: new Date('2026-10-06T06:00:00.000Z'),
  description: 'Replaced the battery.',
  result: 'Holds charge.',
  status: 'PLANNED',
  assignedToId: 3,
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  ...overrides,
})

describe('UNIT-02: canTransitionAction (BR-07)', () => {
  const permitted = new Set([
    'PLANNED>IN_PROGRESS',
    'PLANNED>DONE',
    'PLANNED>CANCELLED',
    'IN_PROGRESS>PLANNED',
    'IN_PROGRESS>DONE',
    'IN_PROGRESS>CANCELLED',
  ])

  it('permits exactly the 6 listed pairs out of 16', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(canTransitionAction(from, to), `${from}>${to}`).toBe(permitted.has(`${from}>${to}`))
      }
    }
  })
})

describe('UNIT-03: lockedFieldChanged (BR-09)', () => {
  it('locks nothing while Planned or In Progress', () => {
    for (const status of ['PLANNED', 'IN_PROGRESS'] as const) {
      const stored = base({ status })
      expect(
        lockedFieldChanged(stored, { ...stored, description: 'New', assignedToId: 9 }),
      ).toBeNull()
    }
  })

  it('leaves only follow-up fields and attachment notes editable when Done', () => {
    const stored = base({ status: 'DONE', followUpRequired: true, followUpNote: 'Call back.' })
    expect(
      lockedFieldChanged(stored, {
        ...stored,
        followUpRequired: false,
        followUpNote: null,
        attachmentNotes: 'log.txt',
      }),
    ).toBeNull()
    expect(lockedFieldChanged(stored, { ...stored, description: 'New' })).toBe('description')
    expect(lockedFieldChanged(stored, { ...stored, result: 'Other' })).toBe('result')
    expect(lockedFieldChanged(stored, { ...stored, actionAt: NOW })).toBe('actionAt')
  })

  it('locks every field when Cancelled', () => {
    const stored = base({ status: 'CANCELLED' })
    expect(lockedFieldChanged(stored, { ...stored, attachmentNotes: 'x' })).toBe('attachmentNotes')
    expect(lockedFieldChanged(stored, { ...stored, assignedToId: 9 })).toBe('assignedToId')
  })

  it('never counts an unchanged value, including an equal Date instance', () => {
    const stored = base({ status: 'CANCELLED' })
    expect(
      lockedFieldChanged(stored, { ...stored, actionAt: new Date(stored.actionAt.getTime()) }),
    ).toBeNull()
  })
})

describe('UNIT-04: payload validation (BR-05, BR-06, BR-08, BR-32)', () => {
  it('trims text and nulls blank optional text', () => {
    const parsed = parseActionBody(
      {
        actionAt: '2026-10-06T13:00:00+07:00',
        description: '  Swapped cable  ',
        result: '   ',
        attachmentNotes: ' a.pdf ',
      },
      'create',
    )
    expect(parsed).toEqual({
      patch: {
        actionAt: new Date('2026-10-06T06:00:00.000Z'),
        description: 'Swapped cable',
        result: null,
        attachmentNotes: 'a.pdf',
      },
    })
  })

  it('enforces lengths and required fields', () => {
    const at = '2026-10-06T06:00:00Z'
    const field = (body: Record<string, unknown>, mode: 'create' | 'update' = 'create') => {
      const r = parseActionBody(body, mode)
      return 'problem' in r ? r.problem.field : null
    }
    expect(field({ actionAt: at })).toBe('description')
    expect(field({ description: 'ok' })).toBe('actionAt')
    expect(field({ actionAt: at, description: 'x'.repeat(2000) })).toBeNull()
    expect(field({ actionAt: at, description: 'x'.repeat(2001) })).toBe('description')
    expect(field({ actionAt: at, description: 'ok', result: 'x'.repeat(2001) })).toBe('result')
    expect(field({ actionAt: at, description: 'ok', attachmentNotes: 'x'.repeat(501) })).toBe(
      'attachmentNotes',
    )
    // Update reads only the fields sent.
    expect(field({}, 'update')).toBeNull()
    expect(field({ status: 'CANCELLED' }, 'update')).toBeNull()
    expect(field({ actionAt: at, description: 'ok', status: 'CANCELLED' })).toBe('status')
  })

  it('rejects a timestamp without an offset', () => {
    const r = parseActionBody({ actionAt: '2026-10-06T06:00:00', description: 'ok' }, 'create')
    expect(r).toMatchObject({ problem: { field: 'actionAt' } })
  })

  it('requires a follow-up note only when follow-up is required, and nulls it otherwise', () => {
    const on = resolveAction(base(), { followUpRequired: true, followUpNote: null })
    expect(actionRuleViolation(on, NOW)?.field).toBe('followUpNote')
    const long = resolveAction(base(), { followUpRequired: true, followUpNote: 'x'.repeat(1001) })
    expect(actionRuleViolation(long, NOW)?.field).toBe('followUpNote')
    const off = resolveAction(base(), { followUpRequired: false, followUpNote: 'x'.repeat(5000) })
    expect(off.followUpNote).toBeNull()
    expect(actionRuleViolation(off, NOW)).toBeNull()
  })

  it('requires a Result for Done', () => {
    expect(actionRuleViolation(base({ status: 'DONE', result: null }), NOW)?.field).toBe('result')
    expect(actionRuleViolation(base({ status: 'DONE' }), NOW)).toBeNull()
  })

  it('rejects a future Action Date/Time only for Done, with 5 minutes of tolerance', () => {
    const at = (ms: number) => new Date(NOW.getTime() + ms)
    expect(actionRuleViolation(base({ status: 'DONE', actionAt: at(5 * 60_000) }), NOW)).toBeNull()
    expect(
      actionRuleViolation(base({ status: 'DONE', actionAt: at(5 * 60_000 + 1) }), NOW)?.field,
    ).toBe('actionAt')
    expect(
      actionRuleViolation(base({ status: 'PLANNED', actionAt: at(86_400_000) }), NOW),
    ).toBeNull()
  })

  it('defaults a new Action to Planned, assigned to the caller', () => {
    const fields = newAction(42, { actionAt: NOW, description: 'ok' })
    expect(fields).toMatchObject({ status: 'PLANNED', assignedToId: 42, followUpRequired: false })
  })
})
