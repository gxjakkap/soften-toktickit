import { describe, expect, it } from 'vitest'
import { evaluateResolutionGate } from '../../src/lib/ticket-status.js'

// UNIT-01 (AC-16, AC-17, AC-18): specification.md BR-18. Reasons come back
// in the fixed order NO_DONE_ACTION, OPEN_ACTIONS, PENDING_FOLLOW_UPS.

const a = (status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED', followUpRequired = false) => ({
  status,
  followUpRequired,
})

describe('evaluateResolutionGate', () => {
  it.each([
    ['no Actions', [], ['NO_DONE_ACTION']],
    ['only Cancelled', [a('CANCELLED')], ['NO_DONE_ACTION']],
    ['one Done', [a('DONE')], []],
    ['Done + Planned', [a('DONE'), a('PLANNED')], ['OPEN_ACTIONS']],
    ['Done + In Progress', [a('DONE'), a('IN_PROGRESS')], ['OPEN_ACTIONS']],
    ['Done with follow-up', [a('DONE', true)], ['PENDING_FOLLOW_UPS']],
    ['Cancelled with follow-up is ignored', [a('DONE'), a('CANCELLED', true)], []],
    [
      'all three failing',
      [a('PLANNED', true), a('CANCELLED')],
      ['NO_DONE_ACTION', 'OPEN_ACTIONS', 'PENDING_FOLLOW_UPS'],
    ],
  ] as const)('%s', (_label, actions, reasons) => {
    expect(evaluateResolutionGate([...actions])).toEqual({
      canResolve: reasons.length === 0,
      reasons,
    })
  })
})
