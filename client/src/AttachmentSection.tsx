import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react'
import { ApiError, attachmentDownloadUrl, removeAttachment, uploadAttachment } from './apiClient'
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, ensureFileName, isAllowedFile } from './lib/attachment-validation'
import type { Attachment } from './types'

type PendingUpload = {
  localId: string
  file: File
  status: 'uploading' | 'error' | 'rejected'
  message?: string
}

function formatSize(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KB`
}

function AttachmentSection({
  requesterId,
  ticketId,
  initialAttachments,
  initialFiles,
  bare,
}: {
  requesterId: number
  ticketId: number
  initialAttachments: Attachment[]
  /** Files already picked/validated before the Ticket existed (Create Ticket's
   *  pre-submit dropzone) — uploaded once on mount instead of re-picked. */
  initialFiles?: File[]
  /** Create Ticket's layout is one single card (ui-spec §11.2) — skip the
   *  outer card chrome Ticket Detail needs to keep this visually distinct
   *  (ui-spec §11.4). */
  bare?: boolean
}) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Attachment | null>(null)
  const [removeReason, setRemoveReason] = useState('')
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const startedInitialUpload = useRef(false)

  const activeCount = attachments.filter((a) => !a.isRemoved).length
  const atCap = activeCount >= MAX_ATTACHMENTS

  async function uploadOne(item: PendingUpload) {
    try {
      const uploaded = await uploadAttachment(requesterId, ticketId, item.file)
      setAttachments((prev) => [...prev, uploaded])
      setPending((prev) => prev.filter((p) => p.localId !== item.localId))
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Upload failed. Please retry.'
      setPending((prev) => prev.map((p) => (p.localId === item.localId ? { ...p, status: 'error', message } : p)))
    }
  }

  function addFiles(files: File[]) {
    if (files.length === 0 || atCap) return

    let remainingSlots = MAX_ATTACHMENTS - activeCount
    for (const rawFile of files) {
      const file = ensureFileName(rawFile)
      const localId = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
      if (remainingSlots <= 0) {
        setPending((prev) => [
          ...prev,
          { localId, file, status: 'rejected', message: `A Ticket may have at most ${MAX_ATTACHMENTS} attachments.` },
        ])
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setPending((prev) => [...prev, { localId, file, status: 'rejected', message: 'File exceeds the 5 MB limit.' }])
        continue
      }
      if (!isAllowedFile(file)) {
        setPending((prev) => [
          ...prev,
          { localId, file, status: 'rejected', message: 'Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, PDF.' },
        ])
        continue
      }
      remainingSlots -= 1
      const item: PendingUpload = { localId, file, status: 'uploading' }
      setPending((prev) => [...prev, item])
      void uploadOne(item)
    }
  }

  useEffect(() => {
    if (startedInitialUpload.current || !initialFiles || initialFiles.length === 0) return
    startedInitialUpload.current = true
    addFiles(initialFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the files Create Ticket staged pre-submit
  }, [])

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    addFiles(files)
  }

  function openFileBrowser() {
    if (!atCap) fileInputRef.current?.click()
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openFileBrowser()
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!atCap) setDragOver(true)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    if (atCap) return
    addFiles(Array.from(event.dataTransfer.files))
  }

  function dismissPending(localId: string) {
    setPending((prev) => prev.filter((p) => p.localId !== localId))
  }

  function retryPending(localId: string) {
    const item = pending.find((p) => p.localId === localId)
    if (!item) return
    setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'uploading', message: undefined } : p)))
    void uploadOne({ ...item, status: 'uploading' })
  }

  function openRemoveDialog(attachment: Attachment) {
    setRemoveTarget(attachment)
    setRemoveReason('')
    setRemoveError(null)
  }

  function closeRemoveDialog() {
    setRemoveTarget(null)
    setRemoveReason('')
    setRemoveError(null)
  }

  async function confirmRemove() {
    if (!removeTarget) return
    setRemoving(true)
    setRemoveError(null)
    try {
      const updated = await removeAttachment(requesterId, removeTarget.id, removeReason.trim())
      setAttachments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      closeRemoveDialog()
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setRemoving(false)
    }
  }

  const content = (
    <>
      <h2 className="zg-section-heading">Attachments</h2>

      <div style={{ marginTop: 'var(--zg-space-4)' }}>
        <label className="zg-label" htmlFor="attachments">
          Attachments (JPG, JPEG, PNG, WEBP, or PDF; 5 MB max per file, 5 files max)
        </label>
        <div
          className={`zg-dropzone${dragOver ? ' is-dragover' : ''}`}
          data-testid="attachment-dropzone"
          role="button"
          tabIndex={atCap ? -1 : 0}
          aria-disabled={atCap}
          aria-label="Attach files: click to browse or drag and drop"
          onClick={openFileBrowser}
          onKeyDown={handleDropzoneKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
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
            disabled={atCap}
            onChange={handleFilesSelected}
          />
          <p className="zg-helper zg-dropzone-text">Drag and drop files here, or click to browse.</p>
        </div>
        {atCap && (
          <p className="zg-helper" style={{ marginTop: 'var(--zg-space-1)' }}>
            5-attachment limit reached. Remove a file to attach another.
          </p>
        )}
      </div>

      {attachments.length === 0 && pending.length === 0 ? (
        <p className="zg-helper" style={{ marginTop: 'var(--zg-space-4)' }}>
          No attachments yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 'var(--zg-space-4)' }}>
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className={`zg-attachment-row${attachment.isRemoved ? ' is-removed' : ''}`}
              style={{ marginBottom: 'var(--zg-space-2)' }}
            >
              <span>
                {attachment.originalFileName} ({formatSize(attachment.sizeBytes)})
                {attachment.isRemoved && (
                  <>
                    {' '}
                    <span className="zg-badge zg-badge-removed">Removed</span>
                    {attachment.removedAt && ` on ${new Date(attachment.removedAt).toLocaleDateString()}`}
                  </>
                )}
              </span>
              {!attachment.isRemoved && (
                <span className="zg-actions" style={{ justifyContent: 'flex-end' }}>
                  <a
                    className="zg-btn zg-btn-tertiary"
                    href={attachmentDownloadUrl(requesterId, attachment.id)}
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    className="zg-btn zg-btn-destructive"
                    onClick={() => openRemoveDialog(attachment)}
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
          {pending.map((item) => (
            <li
              key={item.localId}
              className={`zg-attachment-row${item.status !== 'uploading' ? ' is-invalid' : ''}`}
              style={{ marginBottom: 'var(--zg-space-2)' }}
            >
              <span>
                {item.file.name} ({formatSize(item.file.size)})
                {item.status === 'uploading' && ', uploading…'}
              </span>
              {item.message && <span className="zg-error-message">{item.message}</span>}
              {item.status === 'rejected' && (
                <button type="button" className="zg-btn zg-btn-tertiary" onClick={() => dismissPending(item.localId)}>
                  Dismiss
                </button>
              )}
              {item.status === 'error' && (
                <button type="button" className="zg-btn zg-btn-tertiary" onClick={() => retryPending(item.localId)}>
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {removeTarget && (
        <>
          <div
            className="modal d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-attachment-title"
          >
            <div className="modal-dialog">
              <div className="modal-content zg-modal-content">
                <div className="modal-header">
                  <h5 className="zg-modal-title" id="remove-attachment-title">
                    Remove Attachment
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    title="Close"
                    onClick={closeRemoveDialog}
                  />
                </div>
                <div className="modal-body">
                  <p>
                    Remove <strong>{removeTarget.originalFileName}</strong>? It will no longer be downloadable, but
                    stays listed as removed.
                  </p>
                  <label className="zg-label" htmlFor="remove-reason">
                    Reason (optional)
                  </label>
                  <textarea
                    id="remove-reason"
                    className="zg-field"
                    rows={3}
                    value={removeReason}
                    onChange={(e) => setRemoveReason(e.target.value)}
                  />
                  {removeError && (
                    <p className="zg-error-message" role="alert">
                      {removeError}
                    </p>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="zg-btn zg-btn-secondary" onClick={closeRemoveDialog}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="zg-btn zg-btn-destructive"
                    disabled={removing}
                    aria-disabled={removing}
                    onClick={confirmRemove}
                  >
                    {removing ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}
    </>
  )

  if (bare) return content

  return (
    <div className="zg-card" style={{ marginTop: 'var(--zg-space-5)' }}>
      {content}
    </div>
  )
}

export default AttachmentSection
