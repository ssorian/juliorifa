import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { DomainError } from '../../modules/purchases/domain'
import type { AssetKind } from './s3'

export const limits = {
  image: 2 * 1024 * 1024,
  proof: 10 * 1024 * 1024,
} as const
export async function readBoundedBody(
  request: Request,
  max: number,
): Promise<Buffer> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > max))
    throw new DomainError('FILE_TOO_LARGE')
  if (!request.body) throw new DomainError('INVALID_FILE')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const deadline = { expired: false }
  const timeout = setTimeout(() => {
    deadline.expired = true
    void reader.cancel().catch(() => {})
  }, 30000)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (deadline.expired) throw new DomainError('UPLOAD_TIMEOUT')
      if (done) break
      total += value.byteLength
      if (total > max) {
        await reader.cancel()
        throw new DomainError('FILE_TOO_LARGE')
      }
      chunks.push(value)
    }
  } finally {
    clearTimeout(timeout)
    reader.releaseLock()
  }
  if (!total) throw new DomainError('INVALID_FILE')
  return Buffer.concat(chunks, total)
}
export async function validateFile(
  input: Buffer,
  declared: string,
  kind: AssetKind,
) {
  if (input.length > limits[kind]) throw new DomainError('FILE_TOO_LARGE')
  let mime = ''
  if (
    input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mime = 'image/png'
  else if (input[0] === 255 && input[1] === 216 && input[2] === 255)
    mime = 'image/jpeg'
  else if (
    input.toString('ascii', 0, 4) === 'RIFF' &&
    input.toString('ascii', 8, 12) === 'WEBP'
  )
    mime = 'image/webp'
  else if (/^%PDF-(?:1\.[0-7]|2\.0)\r?\n/.test(input.toString('ascii', 0, 10)))
    mime = 'application/pdf'
  if (
    !mime ||
    declared.toLowerCase().trim() !== mime ||
    (kind === 'image' && mime === 'application/pdf')
  )
    throw new DomainError('INVALID_FILE')
  let bytes = input
  let width: number | null = null,
    height: number | null = null
  if (mime === 'application/pdf') {
    // Structural check only. PDFs remain private attachments; this is not malware scanning.
    if (!/%%EOF\s*$/.test(input.subarray(-1024).toString('ascii')))
      throw new DomainError('INVALID_FILE')
  } else {
    try {
      const decoder = sharp(input, {
        limitInputPixels: 40000000,
        failOn: 'warning',
      })
      decoder.timeout({ seconds: 30 })
      const meta = await decoder.metadata()
      if (
        !meta.width ||
        !meta.height ||
        meta.width * meta.height > 40000000 ||
        (meta.pages ?? 1) > 1
      )
        throw new Error('invalid raster')
      const format =
        mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : 'webp'
      const normalized = await decoder
        .rotate()
        .toFormat(format)
        .toBuffer({ resolveWithObject: true })
      bytes = normalized.data
      width = normalized.info.width
      height = normalized.info.height
    } catch {
      throw new DomainError('INVALID_FILE')
    }
    if (bytes.length > limits[kind]) throw new DomainError('FILE_TOO_LARGE')
  }
  return {
    bytes,
    mime,
    sizeBytes: bytes.length,
    width,
    height,
    digest: createHash('sha256').update(bytes).digest('hex'),
  }
}
