import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { ApiError, createAction, fetchActions, updateAction, type ActionInput } from './apiClient'
import { ActionStatusBadge, FollowUpBadge, RoleBadge, UserStatusBadge } from './badges'
import { formatDateTime, fromBangkokInput, toBangkokInput } from './lib/datetime'
import {
  ACTION_STATUS_LABEL,
  ACTION_TRANSITIONS,
  ACTIVE_TICKET_STATUSES,
  STATUS_LABEL,
} from './lib/ticket-status'
import type { ActionStatus, ActionTaken, ActiveStaffUser, AuthUser, TicketStatus } from './types'

// Lab 4 ui-spec.md §5.2 (IT Staff/Admin) and §6 (Requester, read-only):
// the Actions Taken section of both Ticket Detail screens (FR-01..FR-06).

const DESCRIPTION_MAX = 2000
const RESULT_MAX = 2000
const FOLLOW_UP_NOTE_MAX = 1000
const ATTACHMENT_NOTES_MAX = 500
// BR-08: a Done action may be dated at most 5 minutes ahead (clock skew).
const DONE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000
const FALLBACK_ERROR = 'Something went wrong. Please try again.'
const CREATE_STATUSES: ActionStatus[] = ['PLANNED', 'IN_PROGRESS', 'DONE']

// The same breakpoint as `.zg-table-wrap`/`.zg-ticket-cards` in
// zen-green.css. Only one layout is rendered, so the edit form can open in
// place of its row or card without existing twice in the DOM.
const MOBILE_QUERY = '(max-width: 767px)'
const subscribeMobile = (onChange: () => void) => {
  const query = window.matchMedia?.(MOBILE_QUERY)
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}
const useIsMobile = () =>
  useSyncExternalStore(subscribeMobile, () => window.matchMedia?.(MOBILE_QUERY).matches ?? false)

// BR-14: crypto.randomUUID only exists in a secure context, and the dev
// server is also opened over plain http on the LAN.
const newRequestId = (): string =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))
    ).toString(16),
  )

// BR-13: the server's order (actionAt asc, then id asc), so a saved row
// lands where a reload would put it.
const serverOrder = (a: ActionTaken, b: ActionTaken) =>
  a.actionAt.localeCompare(b.actionAt) || a.id - b.id

export type ActionsTakenStaff = {
  currentUser: AuthUser
  itStaff: ActiveStaffUser[]
  // Lab 4 ui-spec.md §5.2: the resolution gate and status options depend
  // on the Actions, so the screen refetches the Ticket after every save.
  onActionsChanged: () => void
  onAnnounce: (message: string) => void
}

function ActionsTaken({
  ticketId,
  ticketStatus,
  staff,
}: {
  ticketId: number
  ticketStatus: TicketStatus
  // Omitted on the Requester screen, which is read-only (BR-12, AC-07).
  staff?: ActionsTakenStaff
}) {
  const asStaff = staff !== undefined
  const isMobile = useIsMobile()
  const [actions, setActions] = useState<ActionTaken[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; id: number } | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  const load = useCallback(() => {
    setFailed(false)
    setActions(null)
    fetchActions(ticketId, asStaff)
      .then(setActions)
      .catch(() => setFailed(true))
  }, [ticketId, asStaff])

  useEffect(load, [load])

  // Lab 4 ui-spec.md §9: focus returns to the control that opened the form.
  useEffect(() => {
    if (focusId === null) return
    document.getElementById(focusId)?.focus()
    setFocusId(null)
  }, [focusId])

  useEffect(() => {
    if (highlightId === null) return
    const timer = setTimeout(() => setHighlightId(null), 3000)
    return () => clearTimeout(timer)
  }, [highlightId])

  // Reload latest: refetch without the skeleton, so an open form stays put.
  async function reloadAction(id: number) {
    const fresh = await fetchActions(ticketId, true)
    setActions(fresh)
    return fresh.find((a) => a.id === id)
  }

  function handleSaved(saved: ActionTaken, created: boolean) {
    setActions((prev) =>
      [...(prev ?? []).filter((a) => a.id !== saved.id), saved].sort(serverOrder),
    )
    setForm(null)
    setHighlightId(created ? saved.id : null)
    setFocusId(created ? 'add-action' : `edit-action-${saved.id}`)
    staff?.onAnnounce(created ? 'Action added.' : 'Action updated.')
    staff?.onActionsChanged()
  }

  function closeForm() {
    setFocusId(form?.mode === 'edit' ? `edit-action-${form.id}` : 'add-action')
    setForm(null)
  }

  const active = ACTIVE_TICKET_STATUSES.includes(ticketStatus)
  const canWrite = asStaff && active

  const formFor = (action?: ActionTaken) =>
    staff && (
      <ActionForm
        key={action?.id ?? 'new'}
        ticketId={ticketId}
        action={action}
        staff={staff}
        onSaved={handleSaved}
        onCancel={closeForm}
        onReloadAction={reloadAction}
        onTicketChanged={() => {
          setForm(null)
          staff.onActionsChanged()
        }}
      />
    )

  const editControl = (action: ActionTaken) => {
    if (!canWrite) return null
    // ui-spec.md §5.2: no Edit for Cancelled rows; this text takes the
    // button's place as the focus target after cancelling one.
    if (action.status === 'CANCELLED') {
      return (
        <span className="zg-helper" id={`edit-action-${action.id}`} tabIndex={-1}>
          Locked
        </span>
      )
    }
    const label = action.status === 'DONE' ? 'Edit follow-up' : 'Edit'
    return (
      <button
        type="button"
        id={`edit-action-${action.id}`}
        className="zg-btn zg-btn-secondary zg-btn-sm"
        aria-label={`${label}: ${action.description.slice(0, 60)}`}
        disabled={form !== null}
        onClick={() => setForm({ mode: 'edit', id: action.id })}
      >
        {label}
      </button>
    )
  }

  const rowClass = (action: ActionTaken) =>
    [
      action.status === 'CANCELLED' ? 'is-cancelled' : '',
      action.id === highlightId ? 'is-new' : '',
    ].join(' ')

  return (
    <section
      id="actions-taken"
      className="zg-card"
      style={{ marginTop: 'var(--zg-space-5)' }}
      aria-labelledby="actions-taken-heading"
    >
      <div className="zg-actions" style={{ alignItems: 'center' }}>
        <h2 className="zg-section-heading" id="actions-taken-heading" style={{ margin: 0 }}>
          Actions Taken{actions ? ` (${actions.length})` : ''}
        </h2>
        {canWrite && (
          <button
            type="button"
            id="add-action"
            className="zg-btn zg-btn-primary"
            disabled={form !== null}
            onClick={() => setForm({ mode: 'create' })}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" /> Add Action
          </button>
        )}
      </div>

      {asStaff ? (
        !active && (
          <p className="zg-helper" style={{ marginTop: 'var(--zg-space-2)' }}>
            This ticket is {STATUS_LABEL[ticketStatus]}. Reopen it to record more actions.
          </p>
        )
      ) : (
        <p className="zg-helper" style={{ marginTop: 'var(--zg-space-2)' }}>
          Work recorded by IT Staff on your ticket.
        </p>
      )}

      {form?.mode === 'create' && formFor()}

      {failed ? (
        <div style={{ marginTop: 'var(--zg-space-4)' }}>
          <p className="zg-error-message" role="alert">
            Unable to load the actions taken.
          </p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={load}>
            Retry
          </button>
        </div>
      ) : actions === null ? (
        <div style={{ marginTop: 'var(--zg-space-4)' }} aria-live="polite">
          <span className="zg-visually-hidden">Loading actions taken…</span>
          {[0, 1, 2].map((i) => (
            <p key={i} className="zg-skeleton" data-testid="actions-skeleton" aria-hidden="true">
              &nbsp;
            </p>
          ))}
        </div>
      ) : actions.length === 0 ? (
        <p className="zg-helper" style={{ marginTop: 'var(--zg-space-4)' }}>
          No actions recorded yet.
        </p>
      ) : isMobile ? (
        <div className="zg-ticket-cards" style={{ marginTop: 'var(--zg-space-4)' }}>
          {actions.map((action) =>
            form?.mode === 'edit' && form.id === action.id ? (
              <div key={action.id}>{formFor(action)}</div>
            ) : (
              <article
                key={action.id}
                className={`zg-ticket-card zg-action-card ${rowClass(action)}`}
                data-testid="action-row"
              >
                <div className="zg-action-card-top">
                  <time dateTime={action.actionAt}>{formatDateTime(action.actionAt)}</time>
                  <ActionStatusBadge status={action.status} />
                </div>
                <dl>
                  <dt>Description</dt>
                  <dd>
                    <ActionText text={action.description} className="zg-action-description" />
                  </dd>
                  <dt>Result</dt>
                  <dd>{action.result ? <ActionText text={action.result} /> : '—'}</dd>
                  <dt>Performed By</dt>
                  <dd>
                    <Person user={action.performedBy} />
                  </dd>
                  <dt>Assigned To</dt>
                  <dd>
                    <Person user={action.assignedTo} />
                  </dd>
                  <dt>Follow-Up</dt>
                  <dd>
                    <FollowUp action={action} />
                  </dd>
                  {action.attachmentNotes && (
                    <>
                      <dt>Attachment Notes</dt>
                      <dd>
                        <AttachmentNotes notes={action.attachmentNotes} />
                      </dd>
                    </>
                  )}
                </dl>
                {editControl(action)}
              </article>
            ),
          )}
        </div>
      ) : (
        <div className="zg-table-wrap" style={{ marginTop: 'var(--zg-space-4)' }}>
          <table className="zg-table zg-actions-table">
            <thead>
              <tr>
                <th scope="col" className="zg-col-date">
                  Date/Time
                </th>
                <th scope="col">Description</th>
                <th scope="col">Result</th>
                <th scope="col">Performed By</th>
                <th scope="col">Assigned To</th>
                <th scope="col" className="zg-col-status">
                  Status
                </th>
                <th scope="col">Follow-Up</th>
                {canWrite && (
                  <th scope="col" className="zg-col-edit">
                    <span className="zg-visually-hidden">Edit</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {actions.map((action) =>
                form?.mode === 'edit' && form.id === action.id ? (
                  <tr key={action.id}>
                    <td colSpan={canWrite ? 8 : 7}>{formFor(action)}</td>
                  </tr>
                ) : (
                  <tr key={action.id} className={rowClass(action)} data-testid="action-row">
                    <td>
                      <time dateTime={action.actionAt}>{formatDateTime(action.actionAt)}</time>
                    </td>
                    <td>
                      <ActionText text={action.description} className="zg-action-description" />
                      {action.attachmentNotes && <AttachmentNotes notes={action.attachmentNotes} />}
                    </td>
                    <td>{action.result ? <ActionText text={action.result} /> : '—'}</td>
                    <td>
                      <Person user={action.performedBy} />
                    </td>
                    <td>
                      <Person user={action.assignedTo} />
                    </td>
                    <td>
                      <ActionStatusBadge status={action.status} />
                    </td>
                    <td>
                      <FollowUp action={action} />
                    </td>
                    {canWrite && <td>{editControl(action)}</td>}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Person({ user }: { user: { name: string; role: AuthUser['role']; isActive?: boolean } }) {
  return (
    <span className="zg-actions" style={{ justifyContent: 'flex-start', gap: 'var(--zg-space-1)' }}>
      <span>{user.name}</span>
      <RoleBadge role={user.role} />
      {/* BR-04: an open Action can stay assigned to a deactivated user. */}
      {user.isActive === false && <UserStatusBadge active={false} />}
    </span>
  )
}

function FollowUp({ action }: { action: ActionTaken }) {
  if (!action.followUpRequired) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="zg-visually-hidden">Not required</span>
      </>
    )
  }
  return (
    <>
      <FollowUpBadge />
      {action.followUpNote && <ActionText text={action.followUpNote} />}
    </>
  )
}

function AttachmentNotes({ notes }: { notes: string }) {
  return (
    <p className="zg-helper" style={{ margin: 'var(--zg-space-1) 0 0' }}>
      <i className="bi bi-paperclip" aria-hidden="true" /> Files: {notes}
    </p>
  )
}

// ui-spec.md §5.2: long text clamps to 3 lines with a Show more toggle. The
// overflow is measured, so the toggle appears only when text is cut off.
function ActionText({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [text, expanded])

  return (
    <>
      <div ref={ref} className={`zg-action-text ${className} ${expanded ? '' : 'zg-clamp-3'}`}>
        {text}
      </div>
      {(clamped || expanded) && (
        <button
          type="button"
          className="zg-btn-tertiary"
          style={{ padding: 0, textAlign: 'left' }}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}

type Values = {
  actionAt: string
  description: string
  status: ActionStatus
  result: string
  assignedToId: string
  followUpRequired: boolean
  followUpNote: string
  attachmentNotes: string
}
type Field = keyof Values
type FieldErrors = Partial<Record<Field, string>>

const FIELD_ORDER: Field[] = [
  'actionAt',
  'status',
  'description',
  'result',
  'assignedToId',
  'followUpRequired',
  'followUpNote',
  'attachmentNotes',
]

const valuesOf = (action: ActionTaken | undefined, me: number): Values =>
  action
    ? {
        actionAt: toBangkokInput(action.actionAt),
        description: action.description,
        status: action.status,
        result: action.result ?? '',
        assignedToId: String(action.assignedTo.id),
        followUpRequired: action.followUpRequired,
        followUpNote: action.followUpNote ?? '',
        attachmentNotes: action.attachmentNotes ?? '',
      }
    : {
        actionAt: toBangkokInput(),
        description: '',
        status: 'PLANNED',
        result: '',
        assignedToId: String(me),
        followUpRequired: false,
        followUpNote: '',
        attachmentNotes: '',
      }

// api-spec.md §2.2: trimmed, blanks as null, the note only with follow-up.
const toInput = (v: Values): ActionInput => ({
  actionAt: fromBangkokInput(v.actionAt),
  description: v.description.trim(),
  result: v.result.trim() || null,
  status: v.status,
  assignedToId: Number(v.assignedToId),
  followUpRequired: v.followUpRequired,
  followUpNote: v.followUpRequired ? v.followUpNote.trim() : null,
  attachmentNotes: v.attachmentNotes.trim() || null,
})

// Client mirror of BR-05, BR-06, BR-08. Length limits are held by maxLength;
// the server re-checks everything and its field errors land on the same
// fields.
function validate(v: Values): FieldErrors {
  const errors: FieldErrors = {}
  if (!v.actionAt) errors.actionAt = 'Enter the action date and time.'
  else if (
    v.status === 'DONE' &&
    Date.parse(fromBangkokInput(v.actionAt)) > Date.now() + DONE_FUTURE_TOLERANCE_MS
  ) {
    errors.actionAt = 'A Done action cannot be dated in the future.'
  }
  if (!v.description.trim()) errors.description = 'Describe the action taken.'
  if (v.status === 'DONE' && !v.result.trim()) {
    errors.result = 'Enter the result before marking the action Done.'
  }
  if (v.followUpRequired && !v.followUpNote.trim()) {
    errors.followUpNote = 'Enter a follow-up note, or clear Follow-Up Required.'
  }
  return errors
}

type Banner = { text: string; reload?: 'ticket' | 'action' }

function ActionForm({
  ticketId,
  action,
  staff,
  onSaved,
  onCancel,
  onReloadAction,
  onTicketChanged,
}: {
  ticketId: number
  // Undefined in create mode.
  action?: ActionTaken
  staff: ActionsTakenStaff
  onSaved: (action: ActionTaken, created: boolean) => void
  onCancel: () => void
  onReloadAction: (id: number) => Promise<ActionTaken | undefined>
  onTicketChanged: () => void
}) {
  const me = staff.currentUser
  // The record this edit is based on; Reload latest replaces it.
  const [base, setBase] = useState(action)
  const [values, setValues] = useState(() => valuesOf(action, me.id))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<Banner | null>(null)
  const [conflict, setConflict] = useState<ActionTaken | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [saving, setSaving] = useState(false)
  // BR-14, BR-28: one key per opened form, reused by every retry of it.
  const [clientRequestId] = useState(newRequestId)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => headingRef.current?.focus(), [])

  const editing = base !== undefined
  // BR-09: a Done action keeps everything but its follow-up and notes.
  const locked = base?.status === 'DONE'
  const prefix = editing ? `action-${base.id}` : 'new-action'
  const id = (field: Field) => `${prefix}-${field}`
  const statusOptions: ActionStatus[] = base
    ? [base.status, ...ACTION_TRANSITIONS[base.status]]
    : CREATE_STATUSES

  function set<K extends Field>(field: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    if (field === 'status') setConfirmingCancel(false)
  }

  function focusFirstError(found: FieldErrors) {
    const first = FIELD_ORDER.find((f) => found[f])
    if (first) document.getElementById(id(first))?.focus()
  }

  async function save(confirmedCancel = false) {
    // BR-28: Enter in a text input still submits while Save is disabled.
    if (saving) return
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      focusFirstError(found)
      return
    }
    // ui-spec.md §5.2: Cancelled is final, so it is confirmed inline first.
    if (base && values.status === 'CANCELLED' && !confirmedCancel) {
      setConfirmingCancel(true)
      return
    }
    setSaving(true)
    setBanner(null)
    setConflict(null)
    try {
      if (base) {
        // api-spec.md §2.3: the version last read plus only the changed fields.
        const next = toInput(values)
        const prev = toInput(valuesOf(base, me.id))
        const changes = Object.fromEntries(
          Object.entries(next).filter(([key, value]) => prev[key as keyof ActionInput] !== value),
        )
        onSaved(await updateAction(ticketId, base.id, { ...changes, version: base.version }), false)
      } else {
        onSaved(await createAction(ticketId, { ...toInput(values), clientRequestId }), true)
      }
    } catch (err) {
      // FR-20, AC-44: every failure keeps the entered values in the form.
      if (!(err instanceof ApiError)) {
        setBanner({ text: FALLBACK_ERROR })
      } else if (err.code === 'STALE_UPDATE' && err.details?.current) {
        setConflict(err.details.current as ActionTaken)
      } else if (err.code === 'TICKET_NOT_ACTIONABLE') {
        setBanner({ text: 'This ticket is no longer open for actions.', reload: 'ticket' })
      } else if (err.code === 'ACTION_LOCKED' || err.code === 'INVALID_ACTION_TRANSITION') {
        setBanner({ text: err.message, reload: 'action' })
      } else if (err.field && err.field in values) {
        const serverErrors = { [err.field]: err.message }
        setErrors(serverErrors)
        focusFirstError(serverErrors)
      } else {
        setBanner({ text: err.message })
      }
    } finally {
      setSaving(false)
      setConfirmingCancel(false)
    }
  }

  // ui-spec.md §2.2: only now are the user's unsaved edits replaced.
  async function reloadLatest() {
    if (!base) return
    try {
      const fresh = await onReloadAction(base.id)
      if (!fresh) return onCancel()
      setBase(fresh)
      setValues(valuesOf(fresh, me.id))
      setErrors({})
      setBanner(null)
      setConflict(null)
    } catch {
      setBanner({ text: FALLBACK_ERROR, reload: 'action' })
    }
  }

  const describedBy = (field: Field, helperId?: string) =>
    [helperId, errors[field] ? `${id(field)}-error` : undefined].filter(Boolean).join(' ') ||
    undefined
  const fieldClass = (field: Field) => `zg-field${errors[field] ? ' zg-field-invalid' : ''}`
  const errorFor = (field: Field) =>
    errors[field] && (
      <p className="zg-error-message" id={`${id(field)}-error`}>
        {errors[field]}
      </p>
    )
  const required = <span className="zg-required">*</span>
  const readOnlyValue = (field: Field, label: string, text: string) => (
    <div>
      <span className="zg-label" id={`${id(field)}-label`}>
        {label}
      </span>
      <p
        className="zg-field-readonly-value"
        aria-labelledby={`${id(field)}-label`}
        data-testid={`${id(field)}-readonly`}
      >
        {text}
      </p>
    </div>
  )

  const staffLabel = (user: ActiveStaffUser) =>
    user.id === me.id
      ? `${user.name} (me)`
      : user.role === 'ADMINISTRATOR'
        ? `${user.name} · Administrator`
        : user.name
  // BR-04: a kept inactive assignee is not in the active list but must
  // still show as the current value.
  const keptAssignee =
    base && !staff.itStaff.some((u) => u.id === base.assignedTo.id) ? base.assignedTo : null

  return (
    <form
      className="zg-action-form"
      noValidate
      aria-labelledby={`${prefix}-heading`}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        // ui-spec.md §9: Esc is Cancel while focus is inside the form.
        // FR-20, BR-14: closing mid-save would drop the input, any error,
        // and the clientRequestId a retry needs, so Esc waits for the save.
        if (e.key === 'Escape' && !saving) {
          e.preventDefault()
          onCancel()
        }
      }}
    >
      <h3
        className="zg-section-heading"
        id={`${prefix}-heading`}
        ref={headingRef}
        tabIndex={-1}
        style={{ fontSize: '1rem' }}
      >
        {editing ? 'Edit Action' : 'New Action'}
      </h3>
      {/* specification.md §11-6: Requesters see every Action field. */}
      <p className="zg-helper" style={{ margin: 'var(--zg-space-1) 0 var(--zg-space-3)' }}>
        Requesters can see every field of an action. Use Internal Notes for staff-only details.
      </p>
      {locked && (
        <p className="zg-helper">
          <i className="bi bi-lock" aria-hidden="true" /> Done actions keep their date, description,
          result, status, and assignee. Only the follow-up and attachment notes can change.
        </p>
      )}

      {conflict && (
        <div className="zg-banner-warning" role="alert" data-testid="action-conflict">
          <p style={{ margin: 0, fontWeight: 600 }}>
            Someone else changed this action while you were editing.
          </p>
          <p style={{ margin: 'var(--zg-space-1) 0 var(--zg-space-2)' }}>
            Latest values: status {ACTION_STATUS_LABEL[conflict.status]}, assignee{' '}
            {conflict.assignedTo.name}, updated{' '}
            <time dateTime={conflict.updatedAt}>{formatDateTime(conflict.updatedAt)}</time>. Your
            changes below are not saved.
          </p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={reloadLatest}>
            Reload latest
          </button>
        </div>
      )}

      {banner && (
        <div
          className={banner.reload ? 'zg-banner-warning' : 'zg-error'}
          role="alert"
          data-testid="action-form-error"
        >
          <p style={{ margin: 0 }}>{banner.text}</p>
          {banner.reload === 'ticket' && (
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              style={{ marginTop: 'var(--zg-space-2)' }}
              onClick={onTicketChanged}
            >
              Reload ticket
            </button>
          )}
          {banner.reload === 'action' && (
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              style={{ marginTop: 'var(--zg-space-2)' }}
              onClick={reloadLatest}
            >
              Reload latest
            </button>
          )}
        </div>
      )}

      <div className="zg-action-form-grid" style={{ marginTop: 'var(--zg-space-3)' }}>
        {locked ? (
          readOnlyValue('actionAt', 'Action Date/Time', formatDateTime(base.actionAt))
        ) : (
          <div>
            <label className="zg-label" htmlFor={id('actionAt')}>
              Action Date/Time {required}
            </label>
            <input
              id={id('actionAt')}
              type="datetime-local"
              className={fieldClass('actionAt')}
              value={values.actionAt}
              aria-invalid={Boolean(errors.actionAt)}
              aria-describedby={describedBy('actionAt', `${id('actionAt')}-helper`)}
              onChange={(e) => set('actionAt', e.target.value)}
            />
            <p className="zg-helper" id={`${id('actionAt')}-helper`} style={{ margin: 0 }}>
              Bangkok time (UTC+7)
            </p>
            {errorFor('actionAt')}
          </div>
        )}

        {locked ? (
          readOnlyValue('status', 'Status', ACTION_STATUS_LABEL[base.status])
        ) : (
          <div>
            <label className="zg-label" htmlFor={id('status')}>
              Status {required}
            </label>
            <select
              id={id('status')}
              className={fieldClass('status')}
              value={values.status}
              aria-invalid={Boolean(errors.status)}
              aria-describedby={describedBy('status')}
              onChange={(e) => set('status', e.target.value as ActionStatus)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {ACTION_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            {errorFor('status')}
          </div>
        )}

        {locked ? (
          <div className="zg-detail-full">
            {readOnlyValue('description', 'Action Description', base.description)}
          </div>
        ) : (
          <div className="zg-detail-full">
            <label className="zg-label" htmlFor={id('description')}>
              Action Description {required}
            </label>
            <textarea
              id={id('description')}
              className={fieldClass('description')}
              rows={3}
              maxLength={DESCRIPTION_MAX}
              value={values.description}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={describedBy('description')}
              onChange={(e) => set('description', e.target.value)}
            />
            {values.description.length >= DESCRIPTION_MAX * 0.8 && (
              <p className="zg-helper zg-char-count">
                {values.description.length}/{DESCRIPTION_MAX} characters
              </p>
            )}
            {errorFor('description')}
          </div>
        )}

        {locked ? (
          <div className="zg-detail-full">
            {readOnlyValue('result', 'Result', base.result ?? '—')}
          </div>
        ) : (
          <div className="zg-detail-full">
            <label className="zg-label" htmlFor={id('result')}>
              {/* BR-08: Result is required once the action is Done. */}
              Result {values.status === 'DONE' && required}
            </label>
            <textarea
              id={id('result')}
              className={fieldClass('result')}
              rows={3}
              maxLength={RESULT_MAX}
              value={values.result}
              aria-required={values.status === 'DONE'}
              aria-invalid={Boolean(errors.result)}
              aria-describedby={describedBy('result')}
              onChange={(e) => set('result', e.target.value)}
            />
            {values.result.length >= RESULT_MAX * 0.8 && (
              <p className="zg-helper zg-char-count">
                {values.result.length}/{RESULT_MAX} characters
              </p>
            )}
            {errorFor('result')}
          </div>
        )}

        {locked ? (
          readOnlyValue('assignedToId', 'Assigned To', base.assignedTo.name)
        ) : (
          <div>
            <label className="zg-label" htmlFor={id('assignedToId')}>
              Assigned To {required}
            </label>
            <select
              id={id('assignedToId')}
              className={fieldClass('assignedToId')}
              value={values.assignedToId}
              aria-invalid={Boolean(errors.assignedToId)}
              aria-describedby={describedBy('assignedToId')}
              onChange={(e) => set('assignedToId', e.target.value)}
            >
              {keptAssignee && (
                <option value={keptAssignee.id}>{keptAssignee.name} (inactive)</option>
              )}
              {/* Lab 4 api-spec.md §3.9: active IT Staff and Administrators. */}
              {staff.itStaff.map((u) => (
                <option key={u.id} value={u.id}>
                  {staffLabel(u)}
                </option>
              ))}
              {!staff.itStaff.some((u) => u.id === me.id) && !base && (
                <option value={me.id}>{me.name} (me)</option>
              )}
            </select>
            {errorFor('assignedToId')}
          </div>
        )}

        <div>
          <span className="zg-label">Follow-Up</span>
          <label
            className="zg-actions"
            style={{ justifyContent: 'flex-start', gap: 'var(--zg-space-2)' }}
          >
            <input
              id={id('followUpRequired')}
              type="checkbox"
              className="form-check-input"
              checked={values.followUpRequired}
              aria-controls={id('followUpNote')}
              onChange={(e) => set('followUpRequired', e.target.checked)}
            />
            Follow-Up Required?
          </label>
        </div>

        {/* BR-06: revealed, and required, only while follow-up is required. */}
        {values.followUpRequired && (
          <div className="zg-detail-full">
            <label className="zg-label" htmlFor={id('followUpNote')}>
              Follow-Up Note {required}
            </label>
            <textarea
              id={id('followUpNote')}
              className={fieldClass('followUpNote')}
              rows={2}
              maxLength={FOLLOW_UP_NOTE_MAX}
              value={values.followUpNote}
              aria-required="true"
              aria-invalid={Boolean(errors.followUpNote)}
              aria-describedby={describedBy('followUpNote')}
              onChange={(e) => set('followUpNote', e.target.value)}
            />
            {errorFor('followUpNote')}
          </div>
        )}

        <div className="zg-detail-full">
          <label className="zg-label" htmlFor={id('attachmentNotes')}>
            Attachment Notes
          </label>
          <input
            id={id('attachmentNotes')}
            className={fieldClass('attachmentNotes')}
            maxLength={ATTACHMENT_NOTES_MAX}
            placeholder="e.g. battery-diagnostic.pdf in Ticket attachments"
            value={values.attachmentNotes}
            aria-invalid={Boolean(errors.attachmentNotes)}
            aria-describedby={describedBy('attachmentNotes')}
            onChange={(e) => set('attachmentNotes', e.target.value)}
          />
          {errorFor('attachmentNotes')}
        </div>
      </div>

      {/* BR-03: Performed By comes from the session and is never an input. */}
      <p style={{ margin: 'var(--zg-space-3) 0 0' }}>
        <strong>Performed by:</strong> {base ? base.performedBy.name : me.name}
      </p>

      {confirmingCancel && (
        <div className="zg-banner-warning" role="alert" style={{ marginTop: 'var(--zg-space-3)' }}>
          <p style={{ margin: '0 0 var(--zg-space-2)' }}>
            Cancel this action? It will stay visible but can&apos;t be edited.
          </p>
          <div className="zg-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="zg-btn zg-btn-destructive"
              disabled={saving}
              onClick={() => void save(true)}
            >
              Cancel action
            </button>
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              onClick={() => setConfirmingCancel(false)}
            >
              Keep action
            </button>
          </div>
        </div>
      )}

      <div
        className="zg-actions"
        style={{ marginTop: 'var(--zg-space-4)', justifyContent: 'flex-end' }}
      >
        <button
          type="button"
          className="zg-btn zg-btn-secondary"
          disabled={saving}
          aria-disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="zg-btn zg-btn-primary"
          disabled={saving}
          aria-disabled={saving}
          aria-busy={saving}
        >
          {saving && <span className="zg-spinner" aria-hidden="true" />}
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Save Action'}
        </button>
      </div>
    </form>
  )
}

export default ActionsTaken
