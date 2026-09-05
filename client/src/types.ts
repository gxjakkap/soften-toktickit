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
