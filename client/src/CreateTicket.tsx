import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type SubmitEvent,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AttachmentSection from './AttachmentSection'
import { ApiError, createTicket, fetchCategories, fetchRelatedSystems } from './apiClient'
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, ensureFileName, isAllowedFile } from './lib/attachment-validation'
import { useRequester } from './RequesterContext'
import type { Category, RelatedSystem, RequestedPriority, Ticket } from './types'

const SUMMARY_MIN = 5
const SUMMARY_MAX = 120
const DESCRIPTION_MIN = 10
const DESCRIPTION_MAX = 2000

type FieldName = 'categoryId' | 'relatedSystemId' | 'requestedPriority' | 'summary' | 'description'
type Errors = Partial<Record<FieldName, string>>

// Staged pre-submit only — no Ticket exists yet to upload to. Once the
// Ticket is created, AttachmentSection takes over (upload, Download, Remove).
type AttachmentItem = {
  localId: string
  file: File
  status: 'pending' | 'rejected'
  message?: string
}

type RefState = 'loading' | 'ready' | 'error'

function validate(fields: {
  categoryId: string
  relatedSystemId: string
  requestedPriority: string
  summary: string
  description: string
}): Errors {
  const errors: Errors = {}
  if (!fields.categoryId) errors.categoryId = 'Category is required.'
  if (!fields.relatedSystemId) errors.relatedSystemId = 'Related System is required.'
  if (!fields.requestedPriority) errors.requestedPriority = 'Requested Priority is required.'

  const summary = fields.summary.trim()
  if (!summary) errors.summary = 'Summary is required.'
  else if (summary.length < SUMMARY_MIN) errors.summary = `Summary must be at least ${SUMMARY_MIN} characters.`
  else if (summary.length > SUMMARY_MAX) errors.summary = `Summary must be at most ${SUMMARY_MAX} characters.`

  const description = fields.description.trim()
  if (!description) errors.description = 'Description is required.'
  else if (description.length < DESCRIPTION_MIN) {
    errors.description = `Description must be at least ${DESCRIPTION_MIN} characters.`
  } else if (description.length > DESCRIPTION_MAX) {
    errors.description = `Description must be at most ${DESCRIPTION_MAX} characters.`
  }

  return errors
}

function initialFormState() {
  return {
    categoryId: '',
    relatedSystemId: '',
    requestedPriority: '' as RequestedPriority | '',
    summary: '',
    description: '',
  }
}

function CreateTicket() {
  const { requester } = useRequester()
  const navigate = useNavigate()

  const [refState, setRefState] = useState<RefState>('loading')
  const [categories, setCategories] = useState<Category[]>([])
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([])

  const [form, setForm] = useState(initialFormState)
  const [serverFieldErrors, setServerFieldErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null)
  const submittingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadReferenceData = () => {
    setRefState('loading')
    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([cats, systems]) => {
        setCategories(cats)
        setRelatedSystems(systems)
        setRefState('ready')
      })
      .catch(() => setRefState('error'))
  }

  useEffect(loadReferenceData, [])

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (disabled) return
      const items = event.clipboardData?.items
      if (!items) return

      const images: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) images.push(ensureFileName(file))
        }
      }
      if (images.length === 0) return
      event.preventDefault()
      addFiles(images)
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  })

  const liveErrors = useMemo(() => validate(form), [form])

  function fieldError(field: FieldName): string | undefined {
    if (!touched[field]) return undefined
    return liveErrors[field] ?? serverFieldErrors[field]
  }

  function handleBlur(field: FieldName) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function updateField<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [field]: value }))
    setServerFieldErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as FieldName]
      return next
    })
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return

    setAttachments((prev) => {
      const activeCount = prev.filter((a) => a.status !== 'rejected').length
      let remainingSlots = MAX_ATTACHMENTS - activeCount
      const additions: AttachmentItem[] = []

      for (const file of files) {
        const localId = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
        if (remainingSlots <= 0) {
          additions.push({
            localId,
            file,
            status: 'rejected',
            message: `A Ticket may have at most ${MAX_ATTACHMENTS} attachments.`,
          })
          continue
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          additions.push({ localId, file, status: 'rejected', message: 'File exceeds the 5 MB limit.' })
          continue
        }
        if (!isAllowedFile(file)) {
          additions.push({
            localId,
            file,
            status: 'rejected',
            message: 'Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, PDF.',
          })
          continue
        }
        additions.push({ localId, file, status: 'pending' })
        remainingSlots -= 1
      }

      return [...prev, ...additions]
    })
  }

  function dismissAttachment(localId: string) {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId))
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    addFiles(files)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!disabled) setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    if (disabled) return
    addFiles(Array.from(event.dataTransfer.files))
  }

  function openFileBrowser() {
    if (!disabled) fileInputRef.current?.click()
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openFileBrowser()
    }
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (submittingRef.current) return

    const validationErrors = validate(form)
    setTouched({
      categoryId: true,
      relatedSystemId: true,
      requestedPriority: true,
      summary: true,
      description: true,
    })
    if (Object.keys(validationErrors).length > 0) return

    submittingRef.current = true
    setSubmitting(true)
    setServerError(null)

    try {
      const ticket = await createTicket(requester!.id, {
        categoryId: Number(form.categoryId),
        relatedSystemId: Number(form.relatedSystemId),
        requestedPriority: form.requestedPriority as RequestedPriority,
        summary: form.summary.trim(),
        description: form.description.trim(),
      })
      setCreatedTicket(ticket)
    } catch (err) {
      if (err instanceof ApiError && err.field && err.field in form) {
        const field = err.field as FieldName
        const message = err.message
        setServerFieldErrors((prev) => ({ ...prev, [field]: message }))
        setTouched((prev) => ({ ...prev, [field]: true }))
      } else {
        setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function handleCreateAnother() {
    setForm(initialFormState())
    setServerFieldErrors({})
    setTouched({})
    setAttachments([])
    setServerError(null)
    setCreatedTicket(null)
  }

  const disabled = submitting || createdTicket !== null

  return (
    <div className="zg-card">
      <h1 className="zg-title">Create Ticket</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div className="zg-grid-3" style={{ marginTop: 'var(--zg-space-5)' }}>
          <div>
            <label className="zg-label" htmlFor="ticket-number">
              Ticket Number
            </label>
            <input
              id="ticket-number"
              className="zg-field zg-field-readonly"
              readOnly
              value={createdTicket?.ticketNumber ?? 'Generated after submission'}
            />
          </div>
          <div>
            <label className="zg-label" htmlFor="ticket-date">
              Ticket Date
            </label>
            <input
              id="ticket-date"
              className="zg-field zg-field-readonly"
              readOnly
              value={createdTicket ? new Date(createdTicket.createdAt).toLocaleString() : 'Generated after submission'}
            />
          </div>
          <div>
            <label className="zg-label" htmlFor="requester">
              Requester
            </label>
            <input
              id="requester"
              className="zg-field zg-field-readonly"
              readOnly
              value={requester?.name ?? ''}
            />
          </div>
        </div>

        <h2 className="zg-section-heading" style={{ marginTop: 'var(--zg-space-5)' }}>
          Classification
        </h2>
        {refState === 'loading' && (
          <p className="zg-skeleton" aria-live="polite">
            Loading categories and related systems…
          </p>
        )}
        {refState === 'error' && (
          <div>
            <p className="zg-error" role="alert">
              Unable to load Category/Related System options. Please try again.
            </p>
            <button type="button" className="zg-btn zg-btn-secondary" onClick={loadReferenceData}>
              Retry
            </button>
          </div>
        )}
        {refState === 'ready' && (
          <div className="zg-grid-3">
            <div>
              <label className="zg-label" htmlFor="category">
                Category <span className="zg-required">*</span>
              </label>
              <select
                id="category"
                className={`zg-field${fieldError('categoryId') ? ' zg-field-invalid' : ''}`}
                value={form.categoryId}
                disabled={disabled}
                aria-disabled={disabled}
                aria-invalid={Boolean(fieldError('categoryId'))}
                onChange={(e) => updateField('categoryId', e.target.value)}
                onBlur={() => handleBlur('categoryId')}
              >
                <option value="">Choose a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fieldError('categoryId') && <p className="zg-error-message">{fieldError('categoryId')}</p>}
            </div>

            <div>
              <label className="zg-label" htmlFor="related-system">
                Related System <span className="zg-required">*</span>
              </label>
              <select
                id="related-system"
                className={`zg-field${fieldError('relatedSystemId') ? ' zg-field-invalid' : ''}`}
                value={form.relatedSystemId}
                disabled={disabled}
                aria-disabled={disabled}
                aria-invalid={Boolean(fieldError('relatedSystemId'))}
                onChange={(e) => updateField('relatedSystemId', e.target.value)}
                onBlur={() => handleBlur('relatedSystemId')}
              >
                <option value="">Choose a related system…</option>
                {relatedSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {fieldError('relatedSystemId') && <p className="zg-error-message">{fieldError('relatedSystemId')}</p>}
            </div>

            <div>
              <label className="zg-label" htmlFor="requested-priority">
                Requested Priority <span className="zg-required">*</span>
              </label>
              <select
                id="requested-priority"
                className={`zg-field${fieldError('requestedPriority') ? ' zg-field-invalid' : ''}`}
                value={form.requestedPriority}
                disabled={disabled}
                aria-disabled={disabled}
                aria-invalid={Boolean(fieldError('requestedPriority'))}
                onChange={(e) =>
                  updateField('requestedPriority', e.target.value as RequestedPriority | '')
                }
                onBlur={() => handleBlur('requestedPriority')}
              >
                <option value="">Choose a priority…</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
              {fieldError('requestedPriority') && (
                <p className="zg-error-message">{fieldError('requestedPriority')}</p>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'var(--zg-space-5)' }}>
          <label className="zg-label" htmlFor="summary">
            Summary <span className="zg-required">*</span>
          </label>
          <input
            id="summary"
            className={`zg-field${fieldError('summary') ? ' zg-field-invalid' : ''}`}
            value={form.summary}
            maxLength={SUMMARY_MAX}
            disabled={disabled}
            aria-disabled={disabled}
            aria-invalid={Boolean(fieldError('summary'))}
            onChange={(e) => updateField('summary', e.target.value)}
            onBlur={() => handleBlur('summary')}
          />
          {form.summary.length >= SUMMARY_MAX * 0.8 && (
            <p className="zg-helper zg-char-count">
              {form.summary.length}/{SUMMARY_MAX} characters
            </p>
          )}
          {fieldError('summary') && <p className="zg-error-message">{fieldError('summary')}</p>}
        </div>

        <div style={{ marginTop: 'var(--zg-space-5)' }}>
          <label className="zg-label" htmlFor="description">
            Description <span className="zg-required">*</span>
          </label>
          <textarea
            id="description"
            className={`zg-field${fieldError('description') ? ' zg-field-invalid' : ''}`}
            rows={6}
            value={form.description}
            maxLength={DESCRIPTION_MAX}
            disabled={disabled}
            aria-disabled={disabled}
            aria-invalid={Boolean(fieldError('description'))}
            onChange={(e) => updateField('description', e.target.value)}
            onBlur={() => handleBlur('description')}
          />
          {form.description.length >= DESCRIPTION_MAX * 0.8 && (
            <p className="zg-helper zg-char-count">
              {form.description.length}/{DESCRIPTION_MAX} characters
            </p>
          )}
          {fieldError('description') && <p className="zg-error-message">{fieldError('description')}</p>}
        </div>

        <div style={{ marginTop: 'var(--zg-space-5)' }}>
          {createdTicket ? (
            <AttachmentSection
              bare
              requesterId={requester!.id}
              ticketId={createdTicket.id}
              initialAttachments={[]}
              initialFiles={attachments.filter((a) => a.status === 'pending').map((a) => a.file)}
            />
          ) : (
            <>
              <h2 className="zg-section-heading">Attachments</h2>
              <label className="zg-label" htmlFor="attachments" style={{ marginTop: 'var(--zg-space-4)' }}>
                Attachments (JPG, JPEG, PNG, WEBP, or PDF; 5 MB max per file, 5 files max)
              </label>
              <div
                className={`zg-dropzone${dragOver ? ' is-dragover' : ''}`}
                data-testid="attachment-dropzone"
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                aria-label="Attach files: click to browse, drag and drop, or paste an image"
                onClick={openFileBrowser}
                onKeyDown={handleDropzoneKeyDown}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  id="attachments"
                  ref={fileInputRef}
                  type="file"
                  className="zg-visually-hidden"
                  tabIndex={-1}
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  multiple
                  disabled={disabled}
                  onChange={handleFilesSelected}
                />
                <p className="zg-helper zg-dropzone-text">
                  Drag and drop files here, click to browse, or paste an image (Ctrl+V / Cmd+V).
                </p>
              </div>
              {attachments.filter((a) => a.status !== 'rejected').length >= MAX_ATTACHMENTS && (
                <p className="zg-helper" style={{ marginTop: 'var(--zg-space-1)' }}>
                  5-attachment limit reached. Remove a file to attach another.
                </p>
              )}

              {attachments.length > 0 && (
                <ul
                  data-testid="attachment-list"
                  style={{ listStyle: 'none', padding: 0, marginTop: 'var(--zg-space-3)' }}
                >
                  {attachments.map((item) => (
                    <li
                      key={item.localId}
                      className={`zg-attachment-row${item.status === 'rejected' ? ' is-invalid' : ''}`}
                      style={{ marginBottom: 'var(--zg-space-2)' }}
                    >
                      <span>
                        {item.file.name} ({Math.ceil(item.file.size / 1024)} KB)
                      </span>
                      {item.status === 'rejected' && <span className="zg-error-message">{item.message}</span>}
                      <button
                        type="button"
                        className="zg-btn zg-btn-tertiary"
                        onClick={() => dismissAttachment(item.localId)}
                      >
                        {item.status === 'rejected' ? 'Dismiss' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {serverError && (
          <p className="zg-error" role="alert" style={{ marginTop: 'var(--zg-space-4)' }}>
            {serverError}
          </p>
        )}

        {createdTicket ? (
          <div className="zg-success-banner" role="status" style={{ marginTop: 'var(--zg-space-5)' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              <i className="bi bi-check-circle-fill" aria-hidden="true" style={{ marginRight: 'var(--zg-space-2)' }} />
              Ticket created: {createdTicket.ticketNumber}
            </p>
            <div className="zg-actions" style={{ marginTop: 'var(--zg-space-4)' }}>
              <button type="button" className="zg-btn zg-btn-secondary" onClick={handleCreateAnother}>
                Create Another
              </button>
              <Link to={`/tickets/${createdTicket.id}`} className="zg-btn zg-btn-primary">
                View Ticket
              </Link>
            </div>
          </div>
        ) : (
          <div className="zg-actions" style={{ marginTop: 'var(--zg-space-5)' }}>
            <button type="button" className="zg-btn zg-btn-secondary" onClick={() => navigate('/tickets')}>
              Cancel
            </button>
            <button type="submit" className="zg-btn zg-btn-primary" disabled={submitting} aria-disabled={submitting}>
              {submitting && <span className="zg-spinner" aria-hidden="true" />}
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

export default CreateTicket
