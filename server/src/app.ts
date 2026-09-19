import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import { prisma } from './db.js'
import { Prisma } from './generated/prisma/client.js'
import { formatTicketNumber } from './lib/ticket-number.js'
import { resolveActiveRequester } from './lib/requester-context.js'
import {
  clearSessionCookie,
  resolveAuthenticatedUser,
  startSession,
  toIdentity,
} from './lib/auth-context.js'
import { hashPassword, isStrongPassword, verifyPassword } from './lib/password.js'
import {
  MAX_ACTIVE_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  isAllowedAttachment,
} from './lib/attachment-validation.js'
import { withSerializableRetry } from './lib/serializable-retry.js'

export const app = express()

app.use(express.json())

// specification.md §11-6: local disk, server-relative, gitignored, random
// stored filename (collision/path-traversal-safe); original name kept only
// as a display column.
const UPLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads')
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      cb(null, `${randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedAttachment(file.originalname, file.mimetype)) {
      return cb(new UnsupportedFileTypeError())
    }
    cb(null, true)
  },
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TokTickIT API' })
})

const unauthenticated = {
  error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to continue.' },
}
const isFilled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

// Compared against when the email is unknown so both failures cost one bcrypt
// round and can't be told apart by timing (BR-06).
const dummyHash = hashPassword('unused-password')

// api-spec.md §1.1 (FR-01, AC-01, AC-05, AC-06, BR-06, BR-07, BR-15). The
// password is checked before the account state, so "inactive" is only ever
// revealed to someone who already knows the password.
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  for (const [field, value] of [
    ['email', email],
    ['password', password],
  ] as const) {
    if (!isFilled(value)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `${field} is required.`, field },
      })
    }
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await dummyHash))
  if (!user || !passwordOk) {
    return res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    })
  }
  if (!user.isActive) {
    return res.status(403).json({
      error: {
        code: 'INACTIVE_ACCOUNT',
        message: 'This account is inactive. Contact an Administrator.',
      },
    })
  }

  await startSession(prisma, res, user.id)
  res.json(toIdentity(user))
})

// api-spec.md §1.2 (FR-04, AC-07, BR-12).
app.post('/api/auth/logout', async (req, res) => {
  const auth = await resolveAuthenticatedUser(req)
  if (!auth) return res.status(401).json(unauthenticated)

  await prisma.session.delete({ where: { id: auth.sessionId } })
  clearSessionCookie(res)
  res.status(204).end()
})

// api-spec.md §1.3 (FR-03, BR-14).
app.get('/api/auth/me', async (req, res) => {
  const auth = await resolveAuthenticatedUser(req)
  if (!auth) return res.status(401).json(unauthenticated)
  res.json(toIdentity(auth.user))
})

// api-spec.md §1.4 (FR-02, AC-02, AC-30, BR-02, BR-09, BR-10, BR-11). Open to any
// signed-in user, gated or not. Every existing session for the user is dropped
// and a fresh one issued, so a token leaked before the change dies with it.
app.post('/api/auth/change-password', async (req, res) => {
  const auth = await resolveAuthenticatedUser(req)
  if (!auth) return res.status(401).json(unauthenticated)

  const { currentPassword, newPassword } = req.body ?? {}
  for (const [field, value] of [
    ['currentPassword', currentPassword],
    ['newPassword', newPassword],
  ] as const) {
    if (!isFilled(value)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `${field} is required.`, field },
      })
    }
  }

  if (!(await verifyPassword(currentPassword, auth.user.passwordHash))) {
    return res.status(401).json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect.',
        field: 'currentPassword',
      },
    })
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      error: {
        code: 'WEAK_PASSWORD',
        message:
          'Password must be at least 8 characters with an uppercase letter, a lowercase letter, a number, and a special character.',
        field: 'newPassword',
      },
    })
  }

  const passwordHash = await hashPassword(newPassword)
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: auth.user.id },
      data: { passwordHash, mustChangePassword: false },
    })
    await tx.session.deleteMany({ where: { userId: updated.id } })
    await startSession(tx, res, updated.id)
    return updated
  })
  res.json(toIdentity(user))
})

// Only active rows, {id, name} shape (api-spec.md §2). isActive/createdAt
// are never exposed to the client.
app.get('/api/categories', async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
  res.json(categories)
})

// Mirrors /api/categories (api-spec.md §3).
app.get('/api/related-systems', async (_req, res) => {
  const relatedSystems = await prisma.relatedSystem.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
  res.json(relatedSystems)
})

const SUMMARY_MIN = 5
const SUMMARY_MAX = 120
const DESCRIPTION_MIN = 10
const DESCRIPTION_MAX = 2000
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH']

// api-spec.md §4 (FR-02, FR-03, BR-01, BR-02, BR-07, BR-08, BR-20, BR-21).
app.post('/api/tickets', async (req, res) => {
  const requester = await resolveActiveRequester(req)
  if (!requester) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUESTER',
        message: 'Requester is missing, unknown, or inactive.',
      },
    })
  }

  const summary = typeof req.body.summary === 'string' ? req.body.summary.trim() : ''
  if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Summary must be between ${SUMMARY_MIN} and ${SUMMARY_MAX} characters.`,
        field: 'summary',
      },
    })
  }

  const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`,
        field: 'description',
      },
    })
  }

  const requestedPriority = req.body.requestedPriority
  if (!PRIORITIES.includes(requestedPriority)) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Requested priority must be LOW, MEDIUM, or HIGH.',
        field: 'requestedPriority',
      },
    })
  }

  const categoryId = Number(req.body.categoryId)
  const category = Number.isInteger(categoryId)
    ? await prisma.category.findUnique({ where: { id: categoryId } })
    : null
  if (!category?.isActive) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REFERENCE',
        message: 'Category is invalid or inactive.',
        field: 'categoryId',
      },
    })
  }

  const relatedSystemId = Number(req.body.relatedSystemId)
  const relatedSystem = Number.isInteger(relatedSystemId)
    ? await prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } })
    : null
  if (!relatedSystem?.isActive) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REFERENCE',
        message: 'Related System is invalid or inactive.',
        field: 'relatedSystemId',
      },
    })
  }

  // ticketNumber depends on the row's own id (BR-06), so it's set with a
  // placeholder that still satisfies the unique constraint, then updated in
  // the same transaction once the real id is known.
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        ticketNumber: `PENDING-${randomUUID()}`,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        requestedPriority,
        itPriority: requestedPriority,
        summary,
        description,
      },
    })
    return tx.ticket.update({
      where: { id: created.id },
      data: { ticketNumber: formatTicketNumber(created.id, created.createdAt.getFullYear()) },
    })
  })

  res.status(201).json(ticket)
})

const SORTABLE_FIELDS = [
  'createdAt',
  'ticketNumber',
  'summary',
  'requestedPriority',
  'currentStatus',
] as const
const STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

function clampPage(raw: unknown): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 1
}

function clampPageSize(raw: unknown): number {
  if (raw === undefined) return DEFAULT_PAGE_SIZE
  const n = Number(raw)
  if (!Number.isInteger(n)) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(n, 1), MAX_PAGE_SIZE)
}

// api-spec.md §5 (FR-05..09, BR-14, BR-16..19). Ownership (BR-14) scopes
// every query; filters combine with AND (BR-17); page/pageSize are clamped
// rather than rejected (BR-19), everything else invalid is a 400.
app.get('/api/tickets', async (req, res) => {
  const requester = await resolveActiveRequester(req)
  if (!requester) {
    return res.status(400).json({
      error: { code: 'INVALID_REQUESTER', message: 'Requester is missing, unknown, or inactive.' },
    })
  }

  const where: Prisma.TicketWhereInput = { requesterId: requester.id }

  if (typeof req.query.categoryId === 'string' && req.query.categoryId.trim() !== '') {
    const categoryId = Number(req.query.categoryId)
    const category = Number.isInteger(categoryId)
      ? await prisma.category.findUnique({ where: { id: categoryId } })
      : null
    if (!category) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILTER',
          message: 'categoryId does not reference a known Category.',
          field: 'categoryId',
        },
      })
    }
    where.categoryId = categoryId
  }

  if (req.query.requestedPriority !== undefined) {
    if (!PRIORITIES.includes(req.query.requestedPriority as string)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILTER',
          message: 'requestedPriority must be LOW, MEDIUM, or HIGH.',
          field: 'requestedPriority',
        },
      })
    }
    where.requestedPriority = req.query
      .requestedPriority as Prisma.TicketWhereInput['requestedPriority']
  }

  if (req.query.status !== undefined) {
    if (!STATUSES.includes(req.query.status as string)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILTER',
          message: 'status is not a recognized Current Status.',
          field: 'status',
        },
      })
    }
    where.currentStatus = req.query.status as Prisma.TicketWhereInput['currentStatus']
  }

  if (typeof req.query.search === 'string' && req.query.search.trim() !== '') {
    const search = req.query.search.trim()
    where.OR = [
      { ticketNumber: { contains: search, mode: 'insensitive' } },
      { summary: { contains: search, mode: 'insensitive' } },
    ]
  }

  const sortBy = req.query.sortBy === undefined ? 'createdAt' : (req.query.sortBy as string)
  if (!(SORTABLE_FIELDS as readonly string[]).includes(sortBy)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_FILTER',
        message: 'sortBy is not a recognized column.',
        field: 'sortBy',
      },
    })
  }

  const sortDir = req.query.sortDir === undefined ? 'desc' : (req.query.sortDir as string)
  if (sortDir !== 'asc' && sortDir !== 'desc') {
    return res.status(400).json({
      error: { code: 'INVALID_FILTER', message: 'sortDir must be asc or desc.', field: 'sortDir' },
    })
  }

  const page = clampPage(req.query.page)
  const pageSize = clampPageSize(req.query.pageSize)

  const [totalCount, hasAnyTickets, data] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.count({ where: { requesterId: requester.id }, take: 1 }).then((c) => c > 0),
    prisma.ticket.findMany({
      where,
      // A single sort key is not enough to make pagination deterministic
      // when rows tie on it (api-spec.md §5 doesn't name a tie-break); id
      // in the same direction gives every page a stable, repeatable order.
      orderBy: [{ [sortBy]: sortDir }, { id: sortDir }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: { select: { name: true } } },
    }),
  ])

  res.json({
    data: data.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      categoryId: t.categoryId,
      categoryName: t.category.name,
      requestedPriority: t.requestedPriority,
      currentStatus: t.currentStatus,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    page,
    pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    hasAnyTickets,
  })
})

class UnsupportedFileTypeError extends Error {}
class AttachmentLimitReachedError extends Error {}

const uploadSingleFile = upload.single('file')

function handleUpload(req: express.Request, res: express.Response, next: express.NextFunction) {
  uploadSingleFile(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the 5 MB limit.' },
      })
    }
    if (err instanceof UnsupportedFileTypeError) {
      return res.status(415).json({
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: 'File type is not supported. Allowed: JPG, JPEG, PNG, WEBP, PDF.',
        },
      })
    }
    if (err) return next(err)
    next()
  })
}

async function cleanupUploadedFile(file: Express.Multer.File | undefined) {
  if (!file) return
  const { unlink } = await import('node:fs/promises')
  await unlink(file.path).catch(() => {})
}

// Shared by download/remove (api-spec.md §8/§9): BR-15's "not owned looks
// like nonexistent" rule applies identically to both.
async function findOwnedAttachment(id: number, requesterId: number) {
  if (!Number.isInteger(id)) return null
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: {
      id: true,
      ticketId: true,
      originalFileName: true,
      storedFileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      isRemoved: true,
      removedAt: true,
      removedReason: true,
      ticket: { select: { requesterId: true } },
    },
  })
  if (!attachment || attachment.ticket.requesterId !== requesterId) return null
  return attachment
}

// Strips control characters/quotes so a stored original filename can't break
// out of the quoted Content-Disposition value.
function contentDispositionFilename(name: string): string {
  return `attachment; filename="${name.replace(/[\r\n"]/g, '')}"`
}

// api-spec.md §7 (FR-04, BR-24..26, BR-29).
app.post('/api/tickets/:id/attachments', handleUpload, async (req, res) => {
  const requester = await resolveActiveRequester(req)
  if (!requester) {
    await cleanupUploadedFile(req.file)
    return res.status(400).json({
      error: { code: 'INVALID_REQUESTER', message: 'Requester is missing, unknown, or inactive.' },
    })
  }

  const ticketId = Number(req.params.id)
  const ticket = Number.isInteger(ticketId)
    ? await prisma.ticket.findUnique({ where: { id: ticketId } })
    : null
  if (!ticket || ticket.requesterId !== requester.id) {
    await cleanupUploadedFile(req.file)
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } })
  }

  if (!req.file) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'A file is required.', field: 'file' },
    })
  }

  try {
    // Serializable so a concurrent upload against the same Ticket can't
    // both read "4 active" and both insert a 5th, blowing past the cap.
    // Wrapped in withSerializableRetry because Postgres SSI can raise a
    // spurious conflict even between transactions that never really raced.
    const attachment = await withSerializableRetry(prisma, async (tx) => {
      const activeCount = await tx.attachment.count({
        where: { ticketId: ticket.id, isRemoved: false },
      })
      if (activeCount >= MAX_ACTIVE_ATTACHMENTS) throw new AttachmentLimitReachedError()

      // api-spec.md §7's 201 shape never includes storedFileName (the
      // on-disk name, no client use for it) or removedReason (BR-27
      // metadata that only matters once an attachment is removed).
      return tx.attachment.create({
        data: {
          ticketId: ticket.id,
          originalFileName: req.file!.originalname,
          storedFileName: req.file!.filename,
          mimeType: req.file!.mimetype,
          sizeBytes: req.file!.size,
        },
        select: {
          id: true,
          ticketId: true,
          originalFileName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
          isRemoved: true,
        },
      })
    })

    res.status(201).json(attachment)
  } catch (err) {
    await cleanupUploadedFile(req.file)
    if (err instanceof AttachmentLimitReachedError) {
      return res.status(409).json({
        error: {
          code: 'ATTACHMENT_LIMIT_REACHED',
          message: `A Ticket may have at most ${MAX_ACTIVE_ATTACHMENTS} active Attachments.`,
        },
      })
    }
    throw err
  }
})

// api-spec.md §6 (FR-10, BR-14, BR-15, AC-03, AC-24).
app.get('/api/tickets/:id', async (req, res) => {
  const requester = await resolveActiveRequester(req)
  if (!requester) {
    return res.status(400).json({
      error: { code: 'INVALID_REQUESTER', message: 'Requester is missing, unknown, or inactive.' },
    })
  }

  const ticketId = Number(req.params.id)
  const ticket = Number.isInteger(ticketId)
    ? await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          ticketNumber: true,
          requesterId: true,
          requester: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          requestedPriority: true,
          summary: true,
          description: true,
          currentStatus: true,
          createdAt: true,
          updatedAt: true,
          attachments: {
            select: {
              id: true,
              originalFileName: true,
              mimeType: true,
              sizeBytes: true,
              uploadedAt: true,
              isRemoved: true,
              removedAt: true,
            },
          },
        },
      })
    : null

  // BR-15: not-owned looks identical to nonexistent, so ID enumeration can't
  // distinguish "someone else's ticket" from "no such ticket".
  if (!ticket || ticket.requesterId !== requester.id) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } })
  }

  // requesterId is only present for the ownership check above; the api-spec
  // §6 response shape carries the nested `requester` object, not the raw FK.
  const { requesterId: _requesterId, ...responseBody } = ticket
  res.json(responseBody)
})

// api-spec.md §8 (FR-11, BR-28, BR-29, AC-15).
app.get('/api/attachments/:id/download', async (req, res) => {
  const requester = await resolveActiveRequester(req)
  if (!requester) {
    return res.status(400).json({
      error: { code: 'INVALID_REQUESTER', message: 'Requester is missing, unknown, or inactive.' },
    })
  }

  const attachment = await findOwnedAttachment(Number(req.params.id), requester.id)
  if (!attachment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found.' } })
  }
  if (attachment.isRemoved) {
    return res.status(410).json({
      error: {
        code: 'ATTACHMENT_REMOVED',
        message: 'This attachment has been removed and can no longer be downloaded.',
      },
    })
  }

  res.type(attachment.mimeType)
  res.set('Content-Disposition', contentDispositionFilename(attachment.originalFileName))
  res.sendFile(path.join(UPLOADS_DIR, attachment.storedFileName))
})

// api-spec.md §9 (FR-12, BR-27, BR-29, AC-14).
app.patch('/api/attachments/:id/remove', async (req, res) => {
  const requester = await resolveActiveRequester(req)
  if (!requester) {
    return res.status(400).json({
      error: { code: 'INVALID_REQUESTER', message: 'Requester is missing, unknown, or inactive.' },
    })
  }

  const attachment = await findOwnedAttachment(Number(req.params.id), requester.id)
  if (!attachment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found.' } })
  }

  // Idempotent (api-spec.md §9): the caller's desired end state already
  // holds, so a second call returns the existing removed state unchanged
  // rather than overwriting removedReason with this call's (possibly empty).
  const reason =
    typeof req.body.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : null
  const result = attachment.isRemoved
    ? attachment
    : await prisma.attachment.update({
        where: { id: attachment.id },
        data: { isRemoved: true, removedAt: new Date(), removedReason: reason },
        select: {
          id: true,
          ticketId: true,
          originalFileName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
          isRemoved: true,
          removedAt: true,
          removedReason: true,
        },
      })

  res.json({
    id: result.id,
    ticketId: result.ticketId,
    originalFileName: result.originalFileName,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    uploadedAt: result.uploadedAt,
    isRemoved: result.isRemoved,
    removedAt: result.removedAt,
    removedReason: result.removedReason,
  })
})

// Lab 2 testing identities, not authentication (BR-03). Only active rows,
// ordered by name (BR-09); isActive is never exposed to the client.
app.get('/api/dev-requesters', async (_req, res) => {
  const requesters = await prisma.user.findMany({
    where: { isActive: true, role: 'REQUESTER' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  })
  res.json(requesters)
})

// Standard error envelope (api-spec.md §0.2). Never leaks internals.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    })
  },
)
