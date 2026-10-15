import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Lab 4 ui-spec.md §9 and handout §7 (no inaccessible modals): the one
// confirmation dialog. Focus moves into it on open, Tab stays inside, Esc
// closes it, and focus returns to whatever opened it.
function ModalDialog({
  id,
  title,
  onClose,
  footer,
  children,
}: {
  id: string
  title: string
  onClose: () => void
  footer: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => opener?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCloseRef.current()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute('disabled'),
    )
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first?.focus()
    }
  }

  return (
    <>
      <div
        ref={ref}
        className="modal d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-dialog">
          <div className="modal-content zg-modal-content">
            <div className="modal-header">
              <h2 className="zg-modal-title" id={`${id}-title`}>
                {title}
              </h2>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                title="Close"
                onClick={onClose}
              />
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">{footer}</div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  )
}

export default ModalDialog
