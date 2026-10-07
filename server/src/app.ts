import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import { prisma } from './db.js'
import { Prisma, type UserRole } from './generated/prisma/client.js'
import { formatTicketNumber } from './lib/ticket-number.js'
import {
  clearSessionCookie,
  createSession,
  resolveAuthenticatedUser,
  setSessionCookie,
  toIdentity,
} from './lib/auth-context.js'
import { authenticate, requireAuth, requireRole } from './lib/authorization.js'
import { errorEnvelope } from './lib/error-handler.js'
import { hashPassword, isStrongPassword, verifyPassword } from './lib/password.js'
import {
  MAX_ACTIVE_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  isAllowedAttachment,
} from './lib/attachment-validation.js'
import { withSerializableRetry } from './lib/serializable-retry.js'
import {
  type ResolutionBlockReason,
  TICKET_STATUSES,
  canTransition,
  evaluateResolutionGate,
  nextResolvedAt,
} from './lib/ticket-status.js'
import {
  StaleUpdateError,
  isVersion,
  missingVersion,
  updateTicketAtVersion,
} from './lib/ticket-version.js'

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

  setSessionCookie(res, await createSession(prisma, user.id))
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

// api-spec.md §1.3 (FR-03, BR-14). Exempt from the password-change gate
// (§1.5) — it's how the client discovers `mustChangePassword` in the first
// place — so this uses `authenticate` alone, not the full `requireAuth` chain.
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json(toIdentity(req.user!))
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

  // BR-10: the current password is already verified above, so an exact match
  // means the user typed the same password into both fields.
  if (newPassword === currentPassword) {
    return res.status(400).json({
      error: {
        code: 'WEAK_PASSWORD',
        message: 'New password must be different from the current password.',
        field: 'newPassword',
      },
    })
  }

  const passwordHash = await hashPassword(newPassword)
  const { user, token } = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: auth.user.id },
      data: { passwordHash, mustChangePassword: false },
    })
    await tx.session.deleteMany({ where: { userId: updated.id } })
    return { user: updated, token: await createSession(tx, updated.id) }
  })
  setSessionCookie(res, token)
  res.json(toIdentity(user))
})

// Only active rows, {id, name} shape (api-spec.md §2). isActive/createdAt
// are never exposed to the client.
app.get('/api/categories', ...requireAuth, async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
  res.json(categories)
})

// Mirrors /api/categories (api-spec.md §3).
app.get('/api/related-systems', ...requireAuth, async (_req, res) => {
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

// api-spec.md §3.1 (FR-07, BR-01, BR-02, BR-03, BR-07, BR-08, BR-17, BR-20,
// BR-21). requesterId comes from the session, never the request body.
app.post('/api/tickets', ...requireAuth, requireRole('REQUESTER'), async (req, res) => {
  const requester = req.user!

  const summary = typeof req.body?.summary === 'string' ? req.body.summary.trim() : ''
  if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Summary must be between ${SUMMARY_MIN} and ${SUMMARY_MAX} characters.`,
        field: 'summary',
      },
    })
  }

  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`,
        field: 'description',
      },
    })
  }

  const requestedPriority = req.body?.requestedPriority
  if (!PRIORITIES.includes(requestedPriority)) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Requested priority must be LOW, MEDIUM, or HIGH.',
        field: 'requestedPriority',
      },
    })
  }

  const categoryId = Number(req.body?.categoryId)
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

  const relatedSystemId = Number(req.body?.relatedSystemId)
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
    // Lab 4 api-spec.md §3.7 (BR-22): the creation entry, null -> NEW.
    await tx.ticketStatusHistory.create({
      data: {
        ticketId: created.id,
        fromStatus: null,
        toStatus: 'NEW',
        changedById: requester.id,
        changedAt: created.createdAt,
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

// api-spec.md §3.2 (FR-08, BR-03, BR-14, BR-16..19). Ownership (BR-14) scopes
// every query from the session, never a client-supplied requesterId; filters
// combine with AND (BR-17); page/pageSize are clamped rather than rejected
// (BR-19), everything else invalid is a 400.
app.get('/api/tickets', ...requireAuth, requireRole('REQUESTER'), async (req, res) => {
  const requester = req.user!

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
    if (!TICKET_STATUSES.includes(req.query.status as string)) {
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
      include: { category: { select: { name: true } }, owner: { select: { name: true } } },
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
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      ownerName: t.owner?.name ?? null,
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
class TicketNotFoundError extends Error {}

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

// api-spec.md §3.4 (FR-09, FR-04, BR-03, BR-24..26, BR-29).
app.post(
  '/api/tickets/:id/attachments',
  ...requireAuth,
  requireRole('REQUESTER'),
  handleUpload,
  async (req, res) => {
    const requester = req.user!

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
  },
)

// api-spec.md §3.3 (FR-08, BR-03, BR-14, BR-15, BR-16, AC-03, AC-24).
app.get('/api/tickets/:id', ...requireAuth, requireRole('REQUESTER'), async (req, res) => {
  const requester = req.user!

  const ticketId = Number(req.params.id)
  const ticket = Number.isInteger(ticketId)
    ? await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          ticketNumber: true,
          requesterId: true,
          requester: { select: { id: true, name: true } },
          owner: { select: { name: true } },
          itPriority: true,
          requesterConfirmedResolvedAt: true,
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
          // BR-04: a Requester only ever sees PUBLIC comments, never Internal Notes.
          comments: {
            where: { visibility: 'PUBLIC' },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              content: true,
              createdAt: true,
              author: { select: { name: true, role: true } },
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

  // requesterId/owner/comments are reshaped below into the api-spec §3.3
  // response shape (ownerName, comments with flattened authorName/authorRole).
  const { requesterId: _requesterId, owner, comments, ...responseBody } = ticket
  res.json({
    ...responseBody,
    ownerName: owner?.name ?? null,
    comments: comments.map((c) => ({
      id: c.id,
      authorName: c.author.name,
      authorRole: c.author.role,
      content: c.content,
      createdAt: c.createdAt,
    })),
  })
})

// api-spec.md §3.5 (FR-09, FR-11, BR-03, BR-28, BR-29, AC-15).
app.get(
  '/api/attachments/:id/download',
  ...requireAuth,
  requireRole('REQUESTER'),
  async (req, res) => {
    const requester = req.user!

    const attachment = await findOwnedAttachment(Number(req.params.id), requester.id)
    if (!attachment) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Attachment not found.' } })
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
  },
)

// api-spec.md §3.6 (FR-09, FR-12, BR-03, BR-27, BR-29, AC-14).
app.patch(
  '/api/attachments/:id/remove',
  ...requireAuth,
  requireRole('REQUESTER'),
  async (req, res) => {
    const requester = req.user!

    const attachment = await findOwnedAttachment(Number(req.params.id), requester.id)
    if (!attachment) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Attachment not found.' } })
    }

    // Idempotent (api-spec.md §9): the caller's desired end state already
    // holds, so a second call returns the existing removed state unchanged
    // rather than overwriting removedReason with this call's (possibly empty).
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : null
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
  },
)

const COMMENT_CONTENT_MAX = 2000

// api-spec.md §3.7 (FR-10, BR-03, BR-26..28, BR-30). visibility is never
// accepted from the client — a Requester caller can only ever post PUBLIC.
app.post(
  '/api/tickets/:id/comments',
  ...requireAuth,
  requireRole('REQUESTER'),
  async (req, res) => {
    const requester = req.user!

    const ticketId = Number(req.params.id)
    const ticket = Number.isInteger(ticketId)
      ? await prisma.ticket.findUnique({ where: { id: ticketId } })
      : null
    if (!ticket || ticket.requesterId !== requester.id) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } })
    }

    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    if (content.length < 1 || content.length > COMMENT_CONTENT_MAX) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Comment must be between 1 and ${COMMENT_CONTENT_MAX} characters.`,
          field: 'content',
        },
      })
    }

    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, authorId: requester.id, visibility: 'PUBLIC', content },
      select: {
        id: true,
        ticketId: true,
        visibility: true,
        content: true,
        createdAt: true,
        author: { select: { name: true, role: true } },
      },
    })

    res.status(201).json({
      id: comment.id,
      ticketId: comment.ticketId,
      authorName: comment.author.name,
      authorRole: comment.author.role,
      visibility: comment.visibility,
      content: comment.content,
      createdAt: comment.createdAt,
    })
  },
)

// api-spec.md §3.8 (FR-11, BR-03, BR-24, BR-25).
app.patch(
  '/api/tickets/:id/resolved',
  ...requireAuth,
  requireRole('REQUESTER'),
  async (req, res) => {
    const requester = req.user!

    const ticketId = Number(req.params.id)
    const ticket = Number.isInteger(ticketId)
      ? await prisma.ticket.findUnique({ where: { id: ticketId } })
      : null
    if (!ticket || ticket.requesterId !== requester.id) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } })
    }

    if (ticket.currentStatus === 'CLOSED' || ticket.currentStatus === 'CANCELLED') {
      return res.status(409).json({
        error: {
          code: 'TICKET_CLOSED',
          message: 'This Ticket is Closed or Cancelled and can no longer be marked resolved.',
        },
      })
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { requesterConfirmedResolvedAt: new Date() },
      select: { id: true, requesterConfirmedResolvedAt: true },
    })

    res.json(updated)
  },
)

const QUEUE_SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'ticketNumber',
  'requestedPriority',
  'itPriority',
  'currentStatus',
] as const

// api-spec.md §4.1 (FR-12, BR-31, BR-32, AC-22..26, AC-38 n/a here). The
// shared Ticket Queue: not ownership-scoped (BR-31), so `where` carries no
// requesterId/ownerId base filter the way /api/tickets does. Default sort is
// createdAt asc — oldest first (specification.md §12-8) — the opposite
// default from My Tickets.
// Lab 4 specification.md BR-29: every /api/staff/* Ticket route accepts the
// Administrator as well as IT Staff (supersedes Lab 3 BR-40).
const STAFF_ROLES: UserRole[] = ['IT_STAFF', 'ADMINISTRATOR']

app.get('/api/staff/tickets', ...requireAuth, requireRole(...STAFF_ROLES), async (req, res) => {
  const where: Prisma.TicketWhereInput = {}

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

  if (req.query.itPriority !== undefined) {
    if (!PRIORITIES.includes(req.query.itPriority as string)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILTER',
          message: 'itPriority must be LOW, MEDIUM, or HIGH.',
          field: 'itPriority',
        },
      })
    }
    where.itPriority = req.query.itPriority as Prisma.TicketWhereInput['itPriority']
  }

  if (req.query.status !== undefined) {
    if (!TICKET_STATUSES.includes(req.query.status as string)) {
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

  if (req.query.ownerId !== undefined) {
    if (req.query.ownerId === 'unassigned') {
      where.ownerId = null
    } else {
      const ownerId = Number(req.query.ownerId)
      if (!Number.isInteger(ownerId)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_FILTER',
            message: 'ownerId must be an integer id or "unassigned".',
            field: 'ownerId',
          },
        })
      }
      where.ownerId = ownerId
    }
  }

  if (typeof req.query.search === 'string' && req.query.search.trim() !== '') {
    const search = req.query.search.trim()
    where.OR = [
      { ticketNumber: { contains: search, mode: 'insensitive' } },
      { summary: { contains: search, mode: 'insensitive' } },
    ]
  }

  const sortBy = req.query.sortBy === undefined ? 'createdAt' : (req.query.sortBy as string)
  if (!(QUEUE_SORTABLE_FIELDS as readonly string[]).includes(sortBy)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_FILTER',
        message: 'sortBy is not a recognized column.',
        field: 'sortBy',
      },
    })
  }

  const sortDir = req.query.sortDir === undefined ? 'asc' : (req.query.sortDir as string)
  if (sortDir !== 'asc' && sortDir !== 'desc') {
    return res.status(400).json({
      error: { code: 'INVALID_FILTER', message: 'sortDir must be asc or desc.', field: 'sortDir' },
    })
  }

  const page = clampPage(req.query.page)
  const pageSize = clampPageSize(req.query.pageSize)

  const [totalCount, hasAnyTickets, data] = await Promise.all([
    prisma.ticket.count({ where }),
    // api-spec.md §4.1: system-wide, unfiltered — distinguishes the true
    // empty Queue from these-filters-match-nothing (AC-25/AC-26), unlike My
    // Tickets' hasAnyTickets which scopes to the one Requester.
    prisma.ticket.count({ take: 1 }).then((c) => c > 0),
    prisma.ticket.findMany({
      where,
      // Tie-break on id in the same direction keeps pagination deterministic
      // when rows tie on sortBy (same precedent as /api/tickets above).
      orderBy: [{ [sortBy]: sortDir }, { id: sortDir }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: { select: { name: true } }, owner: { select: { name: true } } },
    }),
  ])

  res.json({
    data: data.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      categoryName: t.category.name,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      ownerName: t.owner?.name ?? null,
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
// Issue #7: active IT Staff, name ascending. Not in the
// original api-spec.md §4 contract — added to feed ui-spec.md §6's Reassign
// dropdown, since no existing endpoint an IT Staff caller may call lists
// other IT Staff users (/api/admin/users is Administrator-only, FR-20).
// Documented as api-spec.md §4.1b / specification.md §8.7.
// Lab 4 api-spec.md §3.9 (BR-30, §11-15): same path, now active IT Staff and
// Administrators, each with `role`, feeding the Owner and assignee dropdowns.
app.get(
  '/api/staff/it-staff-users',
  ...requireAuth,
  requireRole(...STAFF_ROLES),
  async (_req, res) => {
    const staff = await prisma.user.findMany({
      where: { role: { in: STAFF_ROLES }, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    })
    res.json(staff)
  },
)

// api-spec.md §4.2 (FR-13, FR-28, BR-04, BR-40): same shape as the Requester
// detail (§3.3), plus `ownerId` (needed by the client to decide Claim-button
// visibility and preselect the Reassign dropdown — not in the illustrative
// response shape, but additive) and, unlike §3.3, every Comment/Note
// regardless of visibility — this is the one place BR-04's Administrator
// promise is actually reachable.
app.get('/api/staff/tickets/:id', ...requireAuth, requireRole(...STAFF_ROLES), async (req, res) => {
  const ticketId = Number(req.params.id)
  const ticket = Number.isInteger(ticketId)
    ? await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          ticketNumber: true,
          requester: { select: { id: true, name: true } },
          ownerId: true,
          owner: { select: { name: true } },
          itPriority: true,
          requesterConfirmedResolvedAt: true,
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          requestedPriority: true,
          summary: true,
          description: true,
          currentStatus: true,
          createdAt: true,
          updatedAt: true,
          version: true,
          resolvedAt: true,
          actionsTaken: { select: { status: true, followUpRequired: true } },
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
          comments: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              visibility: true,
              content: true,
              createdAt: true,
              author: { select: { name: true, role: true } },
            },
          },
        },
      })
    : null

  if (!ticket) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } })
  }

  // Lab 4 api-spec.md §3.5: `resolutionGate` comes from the same function
  // the status endpoint runs; it is advisory, since that endpoint re-checks
  // it inside its transaction (BR-19). Actions themselves aren't embedded.
  const { owner, comments, actionsTaken, ...responseBody } = ticket
  res.json({
    ...responseBody,
    ownerName: owner?.name ?? null,
    resolutionGate: evaluateResolutionGate(actionsTaken),
    comments: comments.map((c) => ({
      id: c.id,
      authorName: c.author.name,
      authorRole: c.author.role,
      visibility: c.visibility,
      content: c.content,
      createdAt: c.createdAt,
    })),
  })
})

// Lab 4 api-spec.md §0.5: TicketWorkflowState, returned by every Ticket
// workflow write and as `details.current` of a Ticket STALE_UPDATE. Lab 3's
// narrower success shapes ({id, ownerId, ownerName}, {id, itPriority},
// {id, currentStatus}) are subsets of it.
const workflowStateSelect = {
  id: true,
  version: true,
  currentStatus: true,
  resolvedAt: true,
  ownerId: true,
  owner: { select: { name: true } },
  itPriority: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect

async function loadWorkflowState(db: Prisma.TransactionClient, ticketId: number) {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: workflowStateSelect,
  })
  if (!ticket) return null
  const { owner, ...state } = ticket
  return { ...state, ownerName: owner?.name ?? null }
}

type WorkflowTicket = NonNullable<Awaited<ReturnType<typeof loadWorkflowState>>>

// Aborts a workflow transaction with a ready-made 4xx response.
class WorkflowRuleError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly body: unknown,
  ) {
    super('workflow rule')
  }
}

const ticketNotFoundBody = { error: { code: 'NOT_FOUND', message: 'Ticket not found.' } }

// Lab 4 api-spec.md §0.4 and §3: the shared shape of claim, reassign, IT
// Priority, and Current Status. After the guards and the body checks the
// route already ran, one Serializable transaction does 404 -> 409
// STALE_UPDATE -> the route's own state rules and write. `apply` returns the
// fields to write (written at `version`, bumping it), or null for a no-op
// that leaves version alone (a repeat claim, §3.1).
async function runWorkflowWrite(
  res: express.Response,
  ticketId: number,
  version: number,
  apply: (
    tx: Prisma.TransactionClient,
    ticket: WorkflowTicket,
  ) => Promise<Prisma.TicketUncheckedUpdateManyInput | null>,
) {
  if (!Number.isInteger(ticketId)) return res.status(404).json(ticketNotFoundBody)
  try {
    const state = await withSerializableRetry(prisma, async (tx) => {
      const ticket = await loadWorkflowState(tx, ticketId)
      if (!ticket) throw new TicketNotFoundError()
      if (ticket.version !== version) throw new StaleUpdateError()
      const data = await apply(tx, ticket)
      if (!data) return ticket
      await updateTicketAtVersion(tx, ticketId, version, data)
      return (await loadWorkflowState(tx, ticketId))!
    })
    res.json(state)
  } catch (err) {
    if (err instanceof TicketNotFoundError) return res.status(404).json(ticketNotFoundBody)
    if (err instanceof WorkflowRuleError) return res.status(err.httpStatus).json(err.body)
    if (err instanceof StaleUpdateError) {
      // BR-26: the current server copy, read after the failed transaction
      // rolled back, so the client can show what changed.
      return res.status(409).json({
        error: {
          code: 'STALE_UPDATE',
          message: 'This ticket was changed by someone else. Reload to see the latest version.',
          field: 'version',
          details: { current: await loadWorkflowState(prisma, ticketId) },
        },
      })
    }
    throw err
  }
}

// api-spec.md §4.3 (FR-14, BR-19, AC-38); Lab 4 api-spec.md §3.1 (BR-24,
// BR-29, BR-30): an Administrator may claim, and `version` is required. A
// repeat claim by the current owner checks `version` but doesn't bump it.
app.patch(
  '/api/staff/tickets/:id/claim',
  ...requireAuth,
  requireRole(...STAFF_ROLES),
  async (req, res) => {
    const staff = req.user!
    if (!isVersion(req.body?.version)) return res.status(400).json(missingVersion)

    await runWorkflowWrite(res, Number(req.params.id), req.body.version, async (_tx, ticket) => {
      if (ticket.ownerId === staff.id) return null
      if (ticket.ownerId !== null) {
        throw new WorkflowRuleError(409, {
          error: {
            code: 'ALREADY_OWNED',
            message:
              'This Ticket is already owned by another IT Staff member. Use Reassign instead.',
          },
        })
      }
      return { ownerId: staff.id }
    })
  },
)

// api-spec.md §4.4 (FR-15, BR-20); Lab 4 api-spec.md §3.2 (BR-24, BR-30):
// any active IT Staff user or Administrator (including the caller), or null
// to clear. The owner check reads the database, so it runs after the
// version check (§0.4 step 7).
app.patch(
  '/api/staff/tickets/:id/owner',
  ...requireAuth,
  requireRole(...STAFF_ROLES),
  async (req, res) => {
    if (!isVersion(req.body?.version)) return res.status(400).json(missingVersion)
    const requested = req.body?.ownerId

    await runWorkflowWrite(res, Number(req.params.id), req.body.version, async (tx) => {
      if (requested === null) return { ownerId: null }
      const candidate = Number(requested)
      const candidateUser = Number.isInteger(candidate)
        ? await tx.user.findUnique({ where: { id: candidate } })
        : null
      if (!candidateUser?.isActive || candidateUser.role === 'REQUESTER') {
        throw new WorkflowRuleError(400, {
          error: {
            code: 'INVALID_OWNER',
            message: 'ownerId must reference an active IT Staff user or Administrator, or be null.',
            field: 'ownerId',
          },
        })
      }
      return { ownerId: candidateUser.id }
    })
  },
)

// api-spec.md §4.5 (FR-16, BR-21); Lab 4 api-spec.md §3.3 (BR-24, BR-29).
app.patch(
  '/api/staff/tickets/:id/priority',
  ...requireAuth,
  requireRole(...STAFF_ROLES),
  async (req, res) => {
    const itPriority = req.body?.itPriority
    if (!PRIORITIES.includes(itPriority)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'itPriority must be LOW, MEDIUM, or HIGH.',
          field: 'itPriority',
        },
      })
    }
    if (!isVersion(req.body?.version)) return res.status(400).json(missingVersion)

    await runWorkflowWrite(res, Number(req.params.id), req.body.version, async () => ({
      itPriority,
    }))
  },
)

// Lab 4 BR-18 reasons in plain words, joined into the safe `message`.
const GATE_REASON_TEXT: Record<ResolutionBlockReason, string> = {
  NO_DONE_ACTION: 'no action is marked Done',
  OPEN_ACTIONS: 'it has open actions',
  PENDING_FOLLOW_UPS: 'it has a pending follow-up',
}

// api-spec.md §4.6 (FR-17, BR-22, specification.md §7); Lab 4 api-spec.md
// §3.4 (FR-07..09, BR-16..22, BR-24). The version check, the matrix, the
// resolution gate over the latest Actions, the write, and the history row
// all happen in one Serializable transaction (BR-19), so a gate result the
// client saw earlier is never trusted and a direct API call gets the same
// checks as the UI.
app.patch(
  '/api/staff/tickets/:id/status',
  ...requireAuth,
  requireRole(...STAFF_ROLES),
  async (req, res) => {
    const caller = req.user!
    const status = req.body?.status
    if (!TICKET_STATUSES.includes(status)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'status is not a recognized Current Status.',
          field: 'status',
        },
      })
    }
    if (!isVersion(req.body?.version)) return res.status(400).json(missingVersion)

    await runWorkflowWrite(res, Number(req.params.id), req.body.version, async (tx, ticket) => {
      if (!canTransition(ticket.currentStatus, status)) {
        throw new WorkflowRuleError(409, {
          error: {
            code: 'INVALID_TRANSITION',
            message: 'This status change is not permitted from the Ticket’s current status.',
          },
        })
      }
      if (status === 'RESOLVED') {
        const gate = evaluateResolutionGate(
          await tx.actionTaken.findMany({
            where: { ticketId: ticket.id },
            select: { status: true, followUpRequired: true },
          }),
        )
        if (!gate.canResolve) {
          throw new WorkflowRuleError(409, {
            error: {
              code: 'RESOLUTION_BLOCKED',
              message: `This ticket can't be resolved yet: ${gate.reasons.map((r) => GATE_REASON_TEXT[r]).join(', ')}.`,
              details: { reasons: gate.reasons },
            },
          })
        }
      }
      // BR-22: one append-only history row per change, in the same
      // transaction; rolled back with it if the versioned write loses.
      const now = new Date()
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: ticket.id,
          fromStatus: ticket.currentStatus,
          toStatus: status,
          changedById: caller.id,
          changedAt: now,
        },
      })
      return { currentStatus: status, resolvedAt: nextResolvedAt(status, now, ticket.resolvedAt) }
    })
  },
)

// Lab 4 api-spec.md §0.5 StatusHistoryEntry, ordered changedAt then id (BR-22).
async function listStatusHistory(ticketId: number) {
  const rows = await prisma.ticketStatusHistory.findMany({
    where: { ticketId },
    orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      changedAt: true,
      changedBy: { select: { id: true, name: true, role: true } },
    },
  })
  return { data: rows }
}

// Lab 4 api-spec.md §3.6 (FR-09, BR-22): read-only; no write route exists.
app.get(
  '/api/staff/tickets/:id/status-history',
  ...requireAuth,
  requireRole(...STAFF_ROLES),
  async (req, res) => {
    const ticketId = Number(req.params.id)
    const ticket = Number.isInteger(ticketId)
      ? await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } })
      : null
    if (!ticket) return res.status(404).json(ticketNotFoundBody)
    res.json(await listStatusHistory(ticket.id))
  },
)

// Lab 4 api-spec.md §3.6 (FR-09, BR-31, §11-16): the Requester's own Ticket
// only; anyone else's is the same 404 as a missing one.
app.get(
  '/api/tickets/:id/status-history',
  ...requireAuth,
  requireRole('REQUESTER'),
  async (req, res) => {
    const ticketId = Number(req.params.id)
    const ticket = Number.isInteger(ticketId)
      ? await prisma.ticket.findUnique({
          where: { id: ticketId },
          select: { id: true, requesterId: true },
        })
      : null
    if (!ticket || ticket.requesterId !== req.user!.id) {
      return res.status(404).json(ticketNotFoundBody)
    }
    res.json(await listStatusHistory(ticket.id))
  },
)

// api-spec.md §4.7 (FR-18, FR-19, BR-26..30). Unlike §3.7, `visibility` is
// accepted from the client — this is the one caller allowed to write INTERNAL.
app.post(
  '/api/staff/tickets/:id/comments',
  ...requireAuth,
  requireRole(...STAFF_ROLES),
  async (req, res) => {
    const staff = req.user!
    const ticketId = Number(req.params.id)

    const visibility = req.body?.visibility
    if (visibility !== 'PUBLIC' && visibility !== 'INTERNAL') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'visibility must be PUBLIC or INTERNAL.',
          field: 'visibility',
        },
      })
    }

    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    if (content.length < 1 || content.length > COMMENT_CONTENT_MAX) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Comment must be between 1 and ${COMMENT_CONTENT_MAX} characters.`,
          field: 'content',
        },
      })
    }

    const ticket = Number.isInteger(ticketId)
      ? await prisma.ticket.findUnique({ where: { id: ticketId } })
      : null
    if (!ticket) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } })
    }

    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, authorId: staff.id, visibility, content },
      select: {
        id: true,
        ticketId: true,
        visibility: true,
        content: true,
        createdAt: true,
        author: { select: { name: true, role: true } },
      },
    })

    res.status(201).json({
      id: comment.id,
      ticketId: comment.ticketId,
      authorName: comment.author.name,
      authorRole: comment.author.role,
      visibility: comment.visibility,
      content: comment.content,
      createdAt: comment.createdAt,
    })
  },
)

// api-spec.md §5 (FR-20..23, FR-25..27): every Admin User Management endpoint is
// Administrator only (Issue #4 guard). Admin scope is user accounts only
// (BR-40); nothing here touches Tickets.
const USER_ROLES = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'] as const
type AdminUserRole = (typeof USER_ROLES)[number]
const isUserRole = (v: unknown): v is AdminUserRole =>
  typeof v === 'string' && (USER_ROLES as readonly string[]).includes(v)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WEAK_PASSWORD_MESSAGE =
  'Password must be at least 8 characters with an uppercase letter, a lowercase letter, a number, and a special character.'

const adminUserShape = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
} as const

const fieldError = (code: string, message: string, field: string) => ({
  error: { code, message, field },
})
const duplicateEmail = {
  error: {
    code: 'DUPLICATE_EMAIL',
    message: 'A user with this email already exists.',
    field: 'email',
  },
}

// Thrown inside a transaction to abort it with a ready-made response.
class AdminRuleError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super('admin rule')
  }
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

// api-spec.md §5.1 (FR-20, BR-38, BR-39): name/email partial match AND an
// optional role filter, name ascending, never paginated.
app.get('/api/admin/users', ...requireAuth, requireRole('ADMINISTRATOR'), async (req, res) => {
  const { search, role } = req.query
  if (role !== undefined && role !== '' && !isUserRole(role)) {
    return res.status(400).json({
      error: { code: 'INVALID_FILTER', message: 'Unrecognized role filter.', field: 'role' },
    })
  }
  const term = typeof search === 'string' ? search.trim() : ''

  const data = await prisma.user.findMany({
    where: {
      ...(role ? { role: role as AdminUserRole } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { email: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: adminUserShape,
  })
  res.json({ data, totalCount: data.length })
})

// api-spec.md §5.2 (FR-21, BR-10, BR-11, BR-15, BR-33, AC-09, AC-29).
app.post('/api/admin/users', ...requireAuth, requireRole('ADMINISTRATOR'), async (req, res) => {
  const { name, email, role, isActive, initialPassword } = req.body ?? {}

  if (!isFilled(name)) {
    return res.status(400).json(fieldError('VALIDATION_ERROR', 'Name is required.', 'name'))
  }
  if (!isFilled(email) || !EMAIL_PATTERN.test(email.trim())) {
    return res
      .status(400)
      .json(fieldError('VALIDATION_ERROR', 'Enter a valid email address.', 'email'))
  }
  if (!isUserRole(role)) {
    return res
      .status(400)
      .json(
        fieldError(
          'VALIDATION_ERROR',
          'Role must be Requester, IT Staff, or Administrator.',
          'role',
        ),
      )
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res
      .status(400)
      .json(fieldError('VALIDATION_ERROR', 'Active state must be true or false.', 'isActive'))
  }
  if (!isStrongPassword(initialPassword)) {
    return res
      .status(400)
      .json(fieldError('WEAK_PASSWORD', WEAK_PASSWORD_MESSAGE, 'initialPassword'))
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (await prisma.user.findUnique({ where: { email: normalizedEmail } })) {
    return res.status(409).json(duplicateEmail)
  }

  try {
    const created = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        role,
        isActive: isActive ?? true,
        passwordHash: await hashPassword(initialPassword),
        mustChangePassword: true,
      },
      select: adminUserShape,
    })
    res.status(201).json(created)
  } catch (err) {
    // Two concurrent creates can both pass the pre-check; the unique index decides.
    if (isUniqueViolation(err)) return res.status(409).json(duplicateEmail)
    throw err
  }
})

// api-spec.md §5.3 (FR-22, FR-25, FR-26, BR-34..36, AC-31, AC-32). The acting
// identity is req.user from the session, never an id in the body (BR-35). The
// last-Administrator check reads then writes, so it runs Serializable.
app.patch(
  '/api/admin/users/:id',
  ...requireAuth,
  requireRole('ADMINISTRATOR'),
  async (req, res) => {
    const targetId = Number(req.params.id)
    const notFound = { error: { code: 'NOT_FOUND', message: 'User not found.' } }
    if (!Number.isInteger(targetId)) return res.status(404).json(notFound)

    const { name, email, role, isActive } = req.body ?? {}
    const data: { name?: string; email?: string; role?: AdminUserRole; isActive?: boolean } = {}

    if (name !== undefined) {
      if (!isFilled(name)) {
        return res.status(400).json(fieldError('VALIDATION_ERROR', 'Name is required.', 'name'))
      }
      data.name = name.trim()
    }
    if (email !== undefined) {
      if (!isFilled(email) || !EMAIL_PATTERN.test(email.trim())) {
        return res
          .status(400)
          .json(fieldError('VALIDATION_ERROR', 'Enter a valid email address.', 'email'))
      }
      data.email = email.trim().toLowerCase()
    }
    if (role !== undefined) {
      if (!isUserRole(role)) {
        return res
          .status(400)
          .json(
            fieldError(
              'VALIDATION_ERROR',
              'Role must be Requester, IT Staff, or Administrator.',
              'role',
            ),
          )
      }
      data.role = role
    }
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res
          .status(400)
          .json(fieldError('VALIDATION_ERROR', 'Active state must be true or false.', 'isActive'))
      }
      data.isActive = isActive
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Provide at least one field to update.' },
      })
    }

    try {
      const updated = await withSerializableRetry(prisma, async (tx) => {
        const target = await tx.user.findUnique({ where: { id: targetId } })
        if (!target) throw new AdminRuleError(404, notFound)

        if (data.email && data.email !== target.email) {
          const clash = await tx.user.findUnique({ where: { email: data.email } })
          if (clash && clash.id !== target.id) throw new AdminRuleError(409, duplicateEmail)
        }

        if (target.id === req.user!.id && data.isActive === false) {
          throw new AdminRuleError(409, {
            error: {
              code: 'SELF_DEACTIVATION',
              message: "You can't deactivate your own account.",
              field: 'isActive',
            },
          })
        }

        const staysActiveAdmin =
          (data.isActive ?? target.isActive) && (data.role ?? target.role) === 'ADMINISTRATOR'
        if (target.role === 'ADMINISTRATOR' && target.isActive && !staysActiveAdmin) {
          const activeAdmins = await tx.user.count({
            where: { role: 'ADMINISTRATOR', isActive: true },
          })
          if (activeAdmins <= 1) {
            throw new AdminRuleError(409, {
              error: {
                code: 'LAST_ADMINISTRATOR',
                message: 'At least one active Administrator is required.',
              },
            })
          }
        }

        const saved = await tx.user.update({
          where: { id: target.id },
          data,
          select: adminUserShape,
        })
        // BR-34: a deactivation or role change takes effect on the very next request.
        if (
          (data.isActive === false && target.isActive) ||
          (data.role !== undefined && data.role !== target.role)
        ) {
          await tx.session.deleteMany({ where: { userId: target.id } })
        }
        return saved
      })
      res.json(updated)
    } catch (err) {
      if (err instanceof AdminRuleError) return res.status(err.status).json(err.body)
      if (isUniqueViolation(err)) return res.status(409).json(duplicateEmail)
      throw err
    }
  },
)

// api-spec.md §5.4 (FR-23, BR-09, BR-10, BR-11, BR-37, AC-30). Does not need the
// previous password; the target must change the new one at next login.
app.patch(
  '/api/admin/users/:id/password',
  ...requireAuth,
  requireRole('ADMINISTRATOR'),
  async (req, res) => {
    const targetId = Number(req.params.id)
    if (!Number.isInteger(targetId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } })
    }
    const { newPassword } = req.body ?? {}
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json(fieldError('WEAK_PASSWORD', WEAK_PASSWORD_MESSAGE, 'newPassword'))
    }

    const passwordHash = await hashPassword(newPassword)
    const updated = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId } })
      if (!target) return null
      await tx.session.deleteMany({ where: { userId: targetId } })
      return tx.user.update({
        where: { id: targetId },
        data: { passwordHash, mustChangePassword: true },
        select: { id: true, mustChangePassword: true },
      })
    })
    if (!updated) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } })
    }
    res.json(updated)
  },
)

// Standard error envelope (api-spec.md §0.2). Never leaks internals.
app.use(errorEnvelope)
