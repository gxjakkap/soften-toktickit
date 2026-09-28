export type UserRole = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'

export type AuthUser = {
  id: number
  name: string
  email: string
  role: UserRole
  mustChangePassword: boolean
}

export type TicketComment = {
  id: number
  authorName: string
  authorRole: UserRole
  content: string
  createdAt: string
}

export type RequestedPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export type TicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
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
  itPriority: RequestedPriority
  currentStatus: TicketStatus
  ownerName: string | null
  createdAt: string
  updatedAt: string
}

export type TicketSortField =
  | 'createdAt'
  | 'ticketNumber'
  | 'summary'
  | 'requestedPriority'
  | 'currentStatus'
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
  removedReason?: string | null
}

export type TicketDetail = {
  id: number
  ticketNumber: string
  requester: { id: number; name: string }
  ownerName: string | null
  category: { id: number; name: string }
  relatedSystem: { id: number; name: string }
  requestedPriority: RequestedPriority
  itPriority: RequestedPriority
  summary: string
  description: string
  currentStatus: TicketStatus
  requesterConfirmedResolvedAt: string | null
  createdAt: string
  updatedAt: string
  attachments: Attachment[]
  comments: TicketComment[]
}
