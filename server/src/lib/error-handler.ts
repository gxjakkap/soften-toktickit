import type { ErrorRequestHandler } from 'express'

// api-spec.md §0.2/§0.3: the standard error envelope, applied to every error
// that reaches Express, not just the ones the app throws deliberately. Two
// cases the naive "always 500" version got wrong (PR #49 review):
// - express.json() rejects malformed/oversized bodies with a 4xx error
//   (SyntaxError.status = 400, PayloadTooLargeError.status = 413); those must
//   stay 4xx, not read as a server fault.
// - once headers are sent (e.g. mid-stream on res.sendFile), Express's own
//   default handler is the only thing that can still respond safely.
function fourXxStatus(err: unknown): number | undefined {
  const status = Number(
    (err as { status?: unknown; statusCode?: unknown })?.status ??
      (err as { statusCode?: unknown })?.statusCode,
  )
  return Number.isInteger(status) && status >= 400 && status < 500 ? status : undefined
}

export const errorEnvelope: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err)

  const status = fourXxStatus(err)
  if (status !== undefined) {
    return res.status(status).json({
      error: { code: 'MALFORMED_REQUEST', message: 'The request could not be read.' },
    })
  }

  console.error(err)
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  })
}
