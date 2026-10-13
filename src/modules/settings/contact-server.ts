import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { contactInput } from './contact-domain'

async function service() {
  const [{ db }, { requireAdmin }, { createContactService }] = await Promise.all([
    import('../../db'),
    import('../auth/services/authorization'),
    import('./contact-service'),
  ])
  return createContactService(db, requireAdmin)
}

async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Error && ['FORBIDDEN', 'UNAUTHORIZED'].includes(error.message)) throw error
    throw new Error('BACKEND_UNAVAILABLE')
  }
}

export const publicBusinessContact = createServerFn({ method: 'GET' })
  .inputValidator(z.object({}).strict())
  .handler(() => safe(async () => (await service()).publicContact()))

export const adminBusinessContact = createServerFn({ method: 'GET' })
  .inputValidator(z.object({}).strict())
  .handler(() => safe(async () => (await service()).adminContact()))

export const saveBusinessContact = createServerFn({ method: 'POST' })
  .inputValidator(contactInput)
  .handler(({ data }) => safe(async () => (await service()).save({
    phone: data.phone ?? '',
    whatsapp: data.whatsapp ?? '',
  })))
