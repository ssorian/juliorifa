import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { methodInput, updateMethodInput, activationInput } from './domain'

async function service() {
  const [{ db }, { requireAdmin }, { createSettingsService }] =
    await Promise.all([
      import('../../db'),
      import('../auth/services/authorization'),
      import('./service'),
    ])
  return createSettingsService(db, requireAdmin)
}
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (
      error instanceof Error &&
      ['NOT_FOUND', 'FORBIDDEN', 'UNAUTHORIZED'].includes(error.message)
    )
      throw error
    throw new Error('BACKEND_UNAVAILABLE')
  }
}
export const adminPaymentMethods = createServerFn({ method: 'GET' })
  .inputValidator(z.object({}).strict())
  .handler(() => safe(async () => (await service()).list()))
export const addPaymentMethod = createServerFn({ method: 'POST' })
  .inputValidator(methodInput)
  .handler(({ data }) => safe(async () => (await service()).add(data)))
export const editPaymentMethod = createServerFn({ method: 'POST' })
  .inputValidator(updateMethodInput)
  .handler(({ data }) => safe(async () => (await service()).edit(data)))
export const activatePaymentMethod = createServerFn({ method: 'POST' })
  .inputValidator(activationInput)
  .handler(({ data }) => safe(async () => (await service()).activate(data)))
