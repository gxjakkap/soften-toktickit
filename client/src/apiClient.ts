import type { Attachment, Category, RelatedSystem, RequestedPriority, Ticket, TicketDetail } from './types'

/** specification.md §11-1 (BR-31): the single frontend seam that attaches the
 *  current Requester's id to a request. Lab 3 only has to change this file
 *  (plus its backend counterpart, requester-context.ts) instead of every
 *  call site. */
export class ApiError extends Error {
  field?: string
  code?: string
  constructor(message: string, field?: string, code?: string) {
    super(message)
    this.field = field
    this.code = code
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(
      body?.error?.message ?? 'Something went wrong. Please try again.',
      body?.error?.field,
      body?.error?.code,
    )
  }
  return body as T
}

export function fetchCategories(): Promise<Category[]> {
  return fetch('/api/categories').then((res) => parseJsonOrThrow<Category[]>(res))
}

export function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  return fetch('/api/related-systems').then((res) => parseJsonOrThrow<RelatedSystem[]>(res))
}

export type CreateTicketInput = {
  categoryId: number
  relatedSystemId: number
  requestedPriority: RequestedPriority
  summary: string
  description: string
}

export function createTicket(requesterId: number, input: CreateTicketInput): Promise<Ticket> {
  return fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requesterId, ...input }),
  }).then((res) => parseJsonOrThrow<Ticket>(res))
}

export function uploadAttachment(requesterId: number, ticketId: number, file: File): Promise<Attachment> {
  const formData = new FormData()
  formData.append('requesterId', String(requesterId))
  formData.append('file', file)
  return fetch(`/api/tickets/${ticketId}/attachments`, { method: 'POST', body: formData }).then((res) =>
    parseJsonOrThrow<Attachment>(res),
  )
}

export function fetchTicket(requesterId: number, ticketId: number): Promise<TicketDetail> {
  return fetch(`/api/tickets/${ticketId}?requesterId=${requesterId}`).then((res) =>
    parseJsonOrThrow<TicketDetail>(res),
  )
}

// api-spec.md §8: the server sets Content-Disposition: attachment, so a plain
// link handles the download — no fetch/blob JS needed.
export function attachmentDownloadUrl(requesterId: number, attachmentId: number): string {
  return `/api/attachments/${attachmentId}/download?requesterId=${requesterId}`
}

export function removeAttachment(requesterId: number, attachmentId: number, reason?: string): Promise<Attachment> {
  return fetch(`/api/attachments/${attachmentId}/remove`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requesterId, reason }),
  }).then((res) => parseJsonOrThrow<Attachment>(res))
}
