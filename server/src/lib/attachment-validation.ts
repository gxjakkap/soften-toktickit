// BR-25: Attachments accept only JPG, JPEG, PNG, WEBP, and PDF, checked by
// file extension AND declared content type (defense against a renamed file).

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const MAX_ACTIVE_ATTACHMENTS = 5

export function isAllowedAttachment(originalFileName: string, mimeType: string): boolean {
  // Path separators mean the name isn't a bare filename — reject rather than
  // let it influence any future storage-path logic.
  if (originalFileName.includes('/') || originalFileName.includes('\\')) return false

  const lastDot = originalFileName.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === originalFileName.length - 1) return false

  const extension = originalFileName.slice(lastDot + 1).toLowerCase()
  const allowedMimeTypes = ALLOWED_EXTENSIONS[extension]
  return allowedMimeTypes !== undefined && allowedMimeTypes.includes(mimeType)
}
