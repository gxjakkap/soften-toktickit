import type { ActionStatus } from '../generated/prisma/client.js'

// specification.md §5.1 (BR-05..BR-09) and api-spec.md §2.2, §2.3: the pure
// Action Taken rules, kept out of the route handlers so they can be
// unit-tested without a database (tests.md UNIT-02..04).

export const ACTION_STATUSES: readonly string[] = ['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED']

// BR-18 (b) and BR-45: the "open" Action statuses, still waiting on work.
export const OPEN_ACTION_STATUSES: ActionStatus[] = ['PLANNED', 'IN_PROGRESS']

export type ActionFields = {
  actionAt: Date
  description: string
  result: string | null
  status: ActionStatus
  assignedToId: number
  followUpRequired: boolean
  followUpNote: string | null
  attachmentNotes: string | null
}
export type ActionPatch = Partial<ActionFields>
export type FieldProblem = { field: string; message: string }

const DESCRIPTION_MAX = 2000
const RESULT_MAX = 2000
const FOLLOW_UP_NOTE_MAX = 1000
const ATTACHMENT_NOTES_MAX = 500
// BR-08: absorbs clock skew between client and server (§11-17).
const DONE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000
// BR-32: an Action Date/Time must carry an explicit offset or `Z`.
// Fractions stop at milliseconds, which is all a Date keeps.
const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/

// Date.parse rolls an out-of-range day over (2026-02-31 becomes 3 March), so
// every calendar part is checked before parsing (PR #77 review).
function parseActionAt(v: unknown): Date | null {
  const m = typeof v === 'string' ? ISO_WITH_OFFSET.exec(v) : null
  if (!m) return null
  const [year, month, day, hour, minute, second = 0, offH = 0, offM = 0] = m
    .slice(1)
    .map((part) => (part === undefined ? undefined : Number(part)))
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
  const valid =
    month! >= 1 &&
    month! <= 12 &&
    day! >= 1 &&
    day! <= daysInMonth &&
    hour! <= 23 &&
    minute! <= 59 &&
    second <= 59 &&
    offM <= 59 &&
    offH * 60 + offM <= 14 * 60
  return valid ? new Date(v as string) : null
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

// BR-07: Done and Cancelled are final.
const TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['PLANNED', 'DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
}

export const canTransitionAction = (from: ActionStatus, to: ActionStatus): boolean =>
  TRANSITIONS[from].includes(to)

class Problem extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message)
  }
}

// Optional free text: absent stays absent, null or blank-after-trim becomes null.
function optionalText(value: unknown, field: string, max: number, label: string) {
  if (value === null) return null
  if (typeof value !== 'string') throw new Problem(field, `${label} must be text.`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new Problem(field, `${label} must be at most ${max} characters.`)
  return trimmed || null
}

function parse(body: Record<string, unknown>, mode: 'create' | 'update'): ActionPatch {
  const patch: ActionPatch = {}
  const sent = (key: string) => body[key] !== undefined

  if (mode === 'create' || sent('actionAt')) {
    const actionAt = parseActionAt(body.actionAt)
    if (!actionAt) {
      throw new Problem(
        'actionAt',
        'Action date/time must be an ISO 8601 timestamp with a time zone offset.',
      )
    }
    patch.actionAt = actionAt
  }
  if (mode === 'create' || sent('description')) {
    const v = typeof body.description === 'string' ? body.description.trim() : ''
    if (v.length < 1 || v.length > DESCRIPTION_MAX) {
      throw new Problem(
        'description',
        `Action description must be between 1 and ${DESCRIPTION_MAX} characters.`,
      )
    }
    patch.description = v
  }
  if (sent('result')) patch.result = optionalText(body.result, 'result', RESULT_MAX, 'Result')
  if (sent('status')) {
    const v = body.status
    // api-spec.md §2.2: an Action is never created already Cancelled.
    if (
      typeof v !== 'string' ||
      !ACTION_STATUSES.includes(v) ||
      (mode === 'create' && v === 'CANCELLED')
    ) {
      throw new Problem(
        'status',
        mode === 'create'
          ? 'Status must be PLANNED, IN_PROGRESS, or DONE.'
          : 'Status must be PLANNED, IN_PROGRESS, DONE, or CANCELLED.',
      )
    }
    patch.status = v as ActionStatus
  }
  // BR-04: a create that omits the assignee (or sends null) defaults to the caller.
  if (sent('assignedToId') && !(mode === 'create' && body.assignedToId === null)) {
    if (!Number.isInteger(body.assignedToId)) {
      throw new Problem('assignedToId', 'Assigned To must be a user id.')
    }
    patch.assignedToId = body.assignedToId as number
  }
  if (sent('followUpRequired')) {
    if (typeof body.followUpRequired !== 'boolean') {
      throw new Problem('followUpRequired', 'Follow-up required must be true or false.')
    }
    patch.followUpRequired = body.followUpRequired
  }
  // BR-06: the note's length only matters when follow-up is required, so it
  // is checked against the resulting record (actionRuleViolation), not here.
  if (sent('followUpNote')) {
    const v = body.followUpNote
    if (v !== null && typeof v !== 'string') {
      throw new Problem('followUpNote', 'Follow-up note must be text.')
    }
    patch.followUpNote = v?.trim() || null
  }
  if (sent('attachmentNotes')) {
    patch.attachmentNotes = optionalText(
      body.attachmentNotes,
      'attachmentNotes',
      ATTACHMENT_NOTES_MAX,
      'Attachment notes',
    )
  }
  return patch
}

// Shape and length checks that need no stored state (api-spec.md §0.4 step 2).
// Fields the API ignores (performedById, ticketId, version, ...) are never read.
export function parseActionBody(
  body: Record<string, unknown>,
  mode: 'create' | 'update',
): { patch: ActionPatch } | { problem: FieldProblem } {
  try {
    return { patch: parse(body, mode) }
  } catch (err) {
    if (err instanceof Problem) return { problem: { field: err.field, message: err.message } }
    throw err
  }
}

// api-spec.md §2.3: field rules apply to the resulting record. BR-06: the
// note is stored null whenever follow-up is not required.
export function resolveAction(base: ActionFields, patch: ActionPatch): ActionFields {
  const next = { ...base, ...patch }
  if (!next.followUpRequired) next.followUpNote = null
  return next
}

// BR-04, api-spec.md §2.2: defaults for a new Action.
export const newAction = (callerId: number, patch: ActionPatch): ActionFields =>
  resolveAction(
    {
      actionAt: patch.actionAt!,
      description: patch.description!,
      result: null,
      status: 'PLANNED',
      assignedToId: callerId,
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: null,
    },
    patch,
  )

// BR-06, BR-08: rules on the resulting record as a whole.
export function actionRuleViolation(action: ActionFields, now: Date): FieldProblem | null {
  if (
    action.followUpRequired &&
    (!action.followUpNote || action.followUpNote.length > FOLLOW_UP_NOTE_MAX)
  ) {
    return {
      field: 'followUpNote',
      message: `A follow-up note of 1 to ${FOLLOW_UP_NOTE_MAX} characters is required when follow-up is needed.`,
    }
  }
  if (action.status === 'DONE') {
    if (!action.result) {
      return { field: 'result', message: 'Enter a result before marking this action Done.' }
    }
    if (action.actionAt.getTime() > now.getTime() + DONE_FUTURE_TOLERANCE_MS) {
      return { field: 'actionAt', message: 'A Done action cannot be dated in the future.' }
    }
  }
  return null
}

const FIELDS = [
  'actionAt',
  'description',
  'result',
  'status',
  'assignedToId',
  'followUpRequired',
  'followUpNote',
  'attachmentNotes',
] as const satisfies readonly (keyof ActionFields)[]

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b

export function changedFields(stored: ActionFields, next: ActionFields): ActionPatch {
  const diff: Record<string, unknown> = {}
  for (const f of FIELDS) if (!same(stored[f], next[f])) diff[f] = next[f]
  return diff as ActionPatch
}

// BR-09: Done keeps only the follow-up fields and attachment notes editable;
// Cancelled keeps nothing. Status itself is governed by BR-07, not the lock.
// Returns the first locked field whose value would change, or null.
const DONE_EDITABLE = new Set<string>(['followUpRequired', 'followUpNote', 'attachmentNotes'])

export function lockedFieldChanged(stored: ActionFields, next: ActionFields): string | null {
  if (stored.status === 'PLANNED' || stored.status === 'IN_PROGRESS') return null
  for (const f of FIELDS) {
    if (f === 'status' || (stored.status === 'DONE' && DONE_EDITABLE.has(f))) continue
    if (!same(stored[f], next[f])) return f
  }
  return null
}
