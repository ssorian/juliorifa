import { state } from './state'

export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: 'EMAIL_NOT_CONFIGURED' | 'EMAIL_UNAVAILABLE',
  ) {
    super('Fixture delivery unavailable')
  }
}
export async function sendEmail(message: {
  to: string
  subject: string
  text: string
  idempotencyKey?: string
}) {
  if (
    message.idempotencyKey &&
    state.messages.some((m) => m.idempotencyKey === message.idempotencyKey)
  )
    return
  state.messages.push({ ...message })
}
