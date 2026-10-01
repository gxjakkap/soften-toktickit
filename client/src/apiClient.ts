import type {
  Attachment,
  AuthUser,
  Category,
  RelatedSystem,
  RequestedPriority,
  SortDirection,
  Ticket,
  TicketComment,
  TicketDetail,
  TicketListResponse,
  TicketQueueResponse,
  TicketQueueSortField,
  TicketSortField,
  TicketStatus,
} from './types'

/** specification.md §11-1 (BR-31): the single frontend seam that attaches the
 *  current user's identity to a request via the session cookie. Lab 3 only
 *  has to change this file (plus its backend counterpart, authorization.ts)
 *  instead of every call site. */
export class ApiError extends Error {
  field?: string
  code?: string
  constructor(message: string, field?: string, code?: string) {
    super(message)
    this.field = field
    this.code = code
  }
}

/** The session was rejected by the server (expired, logged out elsewhere,
 *  deactivated) after the app already believed it was signed in. Every
 *  screen already goes through this one seam, so reacting here — rather
 *  than in each screen — is enough (replaces Lab 2's requesterInvalidated,
 *  which reacted to a deselected dev requester instead of a real session). */
export const sessionInvalidated = new EventTarget()

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (body?.error?.code === 'UNAUTHENTICATED') {
      sessionInvalidated.dispatchEvent(new Event('invalidated'))
    }
    throw new ApiError(
      body?.error?.message ?? 'Something went wrong. Please try again.',
      body?.error?.field,
      body?.error?.code,
    )
  }
  return body as T
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return fetch('/api/auth/me').then((res) => parseJsonOrThrow<AuthUser>(res))
}

export function login(email: string, password: string): Promise<AuthUser> {
  return fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((res) => parseJsonOrThrow<AuthUser>(res))
}

export function logout(): Promise<void> {
  return fetch('/api/auth/logout', { method: 'POST' }).then((res) => {
    if (!res.ok) return parseJsonOrThrow(res)
  })
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

export function createTicket(input: CreateTicketInput): Promise<Ticket> {
  return fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
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

// api-spec.md §3.2: every param is optional, omitted from the query string
// when unset rather than sent as an empty value.
export function fetchTickets(params: TicketListParams = {}): Promise<TicketListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.categoryId !== undefined) query.set('categoryId', String(params.categoryId))
  if (params.requestedPriority) query.set('requestedPriority', params.requestedPriority)
  if (params.status) query.set('status', params.status)
  if (params.sortBy) query.set('sortBy', params.sortBy)
  if (params.sortDir) query.set('sortDir', params.sortDir)
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  const qs = query.toString()
  return fetch(`/api/tickets${qs ? `?${qs}` : ''}`).then((res) =>
    parseJsonOrThrow<TicketListResponse>(res),
  )
}

export type TicketQueueParams = {
  search?: string
  categoryId?: number
  requestedPriority?: RequestedPriority
  itPriority?: RequestedPriority
  status?: TicketStatus
  ownerId?: number | 'unassigned'
  sortBy?: TicketQueueSortField
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

// api-spec.md §4.1: every param optional, omitted from the query string when unset.
export function fetchStaffTickets(params: TicketQueueParams = {}): Promise<TicketQueueResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.categoryId !== undefined) query.set('categoryId', String(params.categoryId))
  if (params.requestedPriority) query.set('requestedPriority', params.requestedPriority)
  if (params.itPriority) query.set('itPriority', params.itPriority)
  if (params.status) query.set('status', params.status)
  if (params.ownerId !== undefined) query.set('ownerId', String(params.ownerId))
  if (params.sortBy) query.set('sortBy', params.sortBy)
  if (params.sortDir) query.set('sortDir', params.sortDir)
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  const qs = query.toString()
  return fetch(`/api/staff/tickets${qs ? `?${qs}` : ''}`).then((res) =>
    parseJsonOrThrow<TicketQueueResponse>(res),
  )
}

export function uploadAttachment(ticketId: number, file: File): Promise<Attachment> {
  const formData = new FormData()
  formData.append('file', file)
  return fetch(`/api/tickets/${ticketId}/attachments`, { method: 'POST', body: formData }).then(
    (res) => parseJsonOrThrow<Attachment>(res),
  )
}

export function fetchTicket(ticketId: number): Promise<TicketDetail> {
  return fetch(`/api/tickets/${ticketId}`).then((res) => parseJsonOrThrow<TicketDetail>(res))
}

// api-spec.md §3.5: the server sets Content-Disposition: attachment, so a
// plain link handles the download — no fetch/blob JS needed.
export function attachmentDownloadUrl(attachmentId: number): string {
  return `/api/attachments/${attachmentId}/download`
}

export function removeAttachment(attachmentId: number, reason?: string): Promise<Attachment> {
  return fetch(`/api/attachments/${attachmentId}/remove`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  }).then((res) => parseJsonOrThrow<Attachment>(res))
}

export function postComment(ticketId: number, content: string): Promise<TicketComment> {
  return fetch(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }).then((res) => parseJsonOrThrow<TicketComment>(res))
}

export function markResolved(
  ticketId: number,
): Promise<{ id: number; requesterConfirmedResolvedAt: string }> {
  return fetch(`/api/tickets/${ticketId}/resolved`, { method: 'PATCH' }).then((res) =>
    parseJsonOrThrow(res),
  )
}
