import { describe, expect, it } from 'vitest'
import { isAllowedAttachment } from '../../src/lib/attachment-validation.js'

// UNIT-02 (BR-25): jpg/jpeg/png/webp/pdf allowed, everything else rejected,
// including path-unsafe names.

describe('isAllowedAttachment', () => {
  it.each([
    ['receipt.jpg', 'image/jpeg'],
    ['receipt.JPG', 'image/jpeg'],
    ['screenshot.jpeg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['report.pdf', 'application/pdf'],
  ])('accepts %s with content type %s', (filename, mimeType) => {
    expect(isAllowedAttachment(filename, mimeType)).toBe(true)
  })

  it.each([
    ['virus.exe', 'application/x-msdownload'],
    ['archive.zip', 'application/zip'],
    ['noextension', 'image/jpeg'],
    ['photo.png', 'application/octet-stream'],
    ['../../etc/passwd.png', 'image/png'],
    ['..\\..\\windows\\file.jpg', 'image/jpeg'],
  ])('rejects %s with content type %s', (filename, mimeType) => {
    expect(isAllowedAttachment(filename, mimeType)).toBe(false)
  })
})
