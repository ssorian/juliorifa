import '@tanstack/react-start/server-only'
import { readBoundedBody } from '../../lib/storage/validation'
import { errorResponse, requireSameOrigin } from '../../lib/storage/http'
import { reviewInput, settingsInput } from './schemas'
import { readSettings, saveSettings } from './services'
import { DomainError } from './domain'
import { review } from './proof-services'

export async function settingsResponse(request: Request) {
  try {
    if (request.method === 'GET')
      return Response.json(await readSettings(), {
        headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
      })
    requireSameOrigin(request)
    let input: unknown
    try {
      input = JSON.parse(
        (await readBoundedBody(request, 8192)).toString('utf8'),
      )
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('INVALID_REQUEST')
    }
    const parsed = settingsInput.safeParse(input)
    if (!parsed.success) throw new DomainError('INVALID_REQUEST')
    return Response.json(await saveSettings(parsed.data), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function reviewResponse(
  request: Request,
  id: string,
  target: 'paid' | 'rejected',
) {
  try {
    requireSameOrigin(request)
    let input: unknown
    try {
      input = JSON.parse(
        (await readBoundedBody(request, 4096)).toString('utf8'),
      )
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('INVALID_REQUEST')
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new DomainError('INVALID_REQUEST')
    const parsed = reviewInput.safeParse({ ...input, id })
    if (!parsed.success || Object.hasOwn(input, 'id'))
      throw new DomainError('INVALID_REQUEST')
    return Response.json(await review(id, target, parsed.data.reason), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
