import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { DomainError } from '../../modules/purchases/domain'

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Cookie',
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new DomainError('FORBIDDEN')
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') throw new DomainError('FORBIDDEN')
}
export function errorResponse(error: unknown) {
  const code = error instanceof DomainError ? error.code : 'BACKEND_UNAVAILABLE'
  const status =
    code === 'UNAUTHORIZED'
      ? 401
      : code === 'FORBIDDEN'
        ? 403
        : code === 'NOT_FOUND'
          ? 404
          : code === 'FILE_TOO_LARGE'
            ? 413
            : code.startsWith('STORAGE_') || code === 'BACKEND_UNAVAILABLE'
              ? 503
              : code === 'RESERVATION_EXPIRED' || code === 'CANNOT_UPLOAD_PROOF'
                ? 409
                : 422
  const rate = code === 'UPLOAD_BUSY' || code === 'UPLOAD_RATE_LIMITED'
  const finalStatus = rate
    ? 429
    : code === 'UPLOAD_LEASE_LOST'
      ? 409
      : code === 'UPLOAD_TIMEOUT'
        ? 408
        : status
  return Response.json(
    { error: code },
    {
      status: finalStatus,
      headers: { ...privateHeaders, ...(rate ? { 'Retry-After': '60' } : {}) },
    },
  )
}
export async function uploadResponse(
  request: Request,
  id: string,
  upload: (id: string, request: Request) => Promise<unknown>,
) {
  try {
    requireSameOrigin(request)
    if (!z.uuid().safeParse(id).success) throw new DomainError('NOT_FOUND')
    const result = await upload(id, request)
    return Response.json(result, { headers: privateHeaders })
  } catch (error) {
    return errorResponse(error)
  }
}
export async function proofResponse(
  id: string,
  download: (id: string) => Promise<{ bytes: Buffer; mime: string }>,
) {
  try {
    if (!z.uuid().safeParse(id).success) throw new DomainError('NOT_FOUND')
    const { bytes, mime } = await download(id)
    const extensions: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    }
    const extension = extensions[mime]
    if (!extension) throw new DomainError('INVALID_ASSET')
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        'Content-Type': mime,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="receipt.${extension}"`,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
export async function mediaResponse(
  id: string,
  url: (id: string) => Promise<string>,
) {
  try {
    if (!z.uuid().safeParse(id).success) throw new DomainError('NOT_FOUND')
    return new Response(null, {
      status: 302,
      headers: { ...privateHeaders, Location: await url(id) },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
