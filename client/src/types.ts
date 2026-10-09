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

// api-spec.md §4.1 (BR-32): the IT Staff Ticket Queue's own row shape and
// sortable-field set, distinct from My Tickets' (no `summary` sort, adds
// `updatedAt`/`itPriority`; no `categoryId`/`requesterId`, since the Queue
// isn't ownership-scoped and only shows derived display fields).
export type TicketQueueItem = {
  id: number
  ticketNumber: string
  summary: string
  categoryName: string
  requestedPriority: RequestedPriority
  itPriority: RequestedPriority
  currentStatus: TicketStatus
  ownerName: string | null
  createdAt: string
  updatedAt: string
}

export type TicketQueueSortField =
  | 'createdAt'
  | 'updatedAt'
  | 'ticketNumber'
  | 'requestedPriority'
  | 'itPriority'
  | 'currentStatus'

export type TicketQueueResponse = {
  data: TicketQueueItem[]
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

// api-spec.md §4.7 (BR-04): a staff-posted comment also carries which of the
// two audiences it's for.
export type CommentVisibility = 'PUBLIC' | 'INTERNAL'

export type StaffTicketComment = TicketComment & { visibility: CommentVisibility }

// api-spec.md §4.2: same shape as TicketDetail, plus `ownerId`
// (specification.md §8.7 — needed to decide Claim-button visibility and
// preselect the Reassign dropdown) and both comment visibilities.
export type StaffTicketDetail = Omit<TicketDetail, 'comments'> & {
  ownerId: number | null
  comments: StaffTicketComment[]
  // Lab 4 api-spec.md §3.5.
  version: number
  resolvedAt: string | null
  resolutionGate: ResolutionGate
}

// Lab 4 specification.md BR-18, in the server's fixed order.
export type ResolutionBlockReason = 'NO_DONE_ACTION' | 'OPEN_ACTIONS' | 'PENDING_FOLLOW_UPS'

export type ResolutionGate = { canResolve: boolean; reasons: ResolutionBlockReason[] }

// Lab 4 api-spec.md §0.5: returned by every Ticket workflow write and in a
// STALE_UPDATE's `details.current`.
export type TicketWorkflowState = {
  id: number
  version: number
  currentStatus: TicketStatus
  resolvedAt: string | null
  ownerId: number | null
  ownerName: string | null
  itPriority: RequestedPriority
  updatedAt: string
}

// Lab 4 api-spec.md §0.5. fromStatus is null only on the creation entry.
export type StatusHistoryEntry = {
  id: number
  fromStatus: TicketStatus | null
  toStatus: TicketStatus
  changedBy: { id: number; name: string; role: UserRole }
  changedAt: string
}

// api-spec.md §4.1b: the Reassign dropdown's option list. Lab 4 §3.9 adds
// Administrators and each user's role.
export type ActiveStaffUser = { id: number; name: string; role: UserRole }

// api-spec.md §5 (Issue #8): Administrator User Management.
export type AdminUser = {
  id: number
  name: string
  email: string
  role: UserRole
  isActive: boolean
}

export type AdminUserListResponse = { data: AdminUser[]; totalCount: number }

// Lab 4 api-spec.md §0.5 (BR-07): an Action Taken's own status.
export type ActionStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'

// Lab 4 api-spec.md §0.5: one Action Taken, as both the staff and the
// Requester endpoints return it.
export type ActionTaken = {
  id: number
  ticketId: number
  actionAt: string
  description: string
  result: string | null
  status: ActionStatus
  performedBy: { id: number; name: string; role: UserRole }
  assignedTo: { id: number; name: string; role: UserRole; isActive: boolean }
  followUpRequired: boolean
  followUpNote: string | null
  attachmentNotes: string | null
  version: number
  createdAt: string
  updatedAt: string
}
