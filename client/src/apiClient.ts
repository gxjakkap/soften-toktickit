import type {
  Attachment,
  Category,
  RelatedSystem,
  RequestedPriority,
  SortDirection,
  Ticket,
  TicketDetail,
  TicketListResponse,
  TicketSortField,
  TicketStatus,
} from './types'

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

export type TicketListParams = {
  search?: string
  categoryId?: number
  requestedPriority?: RequestedPriority
  status?: TicketStatus
  sortBy?: TicketSortField
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

// api-spec.md §5: requesterId is the only required param; everything else is
// omitted from the query string when unset rather than sent as an empty value.
export function fetchTickets(requesterId: number, params: TicketListParams = {}): Promise<TicketListResponse> {
  const query = new URLSearchParams({ requesterId: String(requesterId) })
  if (params.search) query.set('search', params.search)
  if (params.categoryId !== undefined) query.set('categoryId', String(params.categoryId))
  if (params.requestedPriority) query.set('requestedPriority', params.requestedPriority)
  if (params.status) query.set('status', params.status)
  if (params.sortBy) query.set('sortBy', params.sortBy)
  if (params.sortDir) query.set('sortDir', params.sortDir)
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  return fetch(`/api/tickets?${query.toString()}`).then((res) => parseJsonOrThrow<TicketListResponse>(res))
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
