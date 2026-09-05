// Client-side mirror of server/src/lib/attachment-validation.ts (BR-25).
// Shared by CreateTicket and AttachmentSection so both screens reject the
// same files with the same messages before any upload request fires.

export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
}

export function isAllowedFile(file: File): boolean {
  const dot = file.name.lastIndexOf('.')
  if (dot <= 0) return false
  const extension = file.name.slice(dot + 1).toLowerCase()
  const allowedMimeTypes = ALLOWED_EXTENSIONS[extension]
  return allowedMimeTypes !== undefined && allowedMimeTypes.includes(file.type)
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// Clipboard images often arrive with no filename/extension — synthesize one
// from the MIME type so isAllowedFile (and the server) can recognize it.
export function ensureFileName(file: File): File {
  if (file.name && file.name.lastIndexOf('.') > 0) return file
  const extension = EXTENSION_BY_MIME_TYPE[file.type]
  if (!extension) return file
  return new File([file], `pasted-image-${Date.now()}.${extension}`, { type: file.type })
}
