export type RequestedPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export type TicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED'

export type Category = { id: number; name: string }
export type RelatedSystem = { id: number; name: string }

export type Ticket = {
  id: number
  ticketNumber: string
  requesterId: number
  categoryId: number
  relatedSystemId: number
  requestedPriority: RequestedPriority
  summary: string
  description: string
  currentStatus: TicketStatus
  createdAt: string
  updatedAt: string
}

export type TicketListItem = {
  id: number
  ticketNumber: string
  summary: string
  categoryId: number
  categoryName: string
  requestedPriority: RequestedPriority
  currentStatus: TicketStatus
  createdAt: string
  updatedAt: string
}

export type TicketSortField = 'createdAt' | 'ticketNumber' | 'summary' | 'requestedPriority' | 'currentStatus'
export type SortDirection = 'asc' | 'desc'

export type TicketListResponse = {
  data: TicketListItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasAnyTickets: boolean
}

export type Attachment = {
  id: number
  ticketId: number
  originalFileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  isRemoved: boolean
  removedAt?: string | null
}
