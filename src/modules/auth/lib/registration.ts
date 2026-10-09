import { APIError } from 'better-auth/api'
import { requireRegistrationPhone } from './phone'

export const phoneField = {
  type: 'string',
  required: false,
  input: true,
} as const
/** Called by Better Auth before signup; login and legacy users are untouched. */
export function validateRegistrationPhone(ctx: {
  path: string
  body?: Record<string, unknown>
}) {
  if (ctx.path !== '/sign-up/email') return
  try {
    const phone = requireRegistrationPhone(ctx.body?.phone)
    if (!ctx.body) throw new Error('PHONE_REQUIRED')
    ctx.body.phone = phone
  } catch {
    throw new APIError('BAD_REQUEST', {
      message: 'Teléfono internacional obligatorio.',
    })
  }
}
