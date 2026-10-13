import { z } from 'zod'
import { normalizePhone } from '../auth/lib/phone'

const optionalPhone = z.string().max(40).transform((value, context) => {
  if (!value.trim()) return null
  const phone = normalizePhone(value)
  if (!phone) {
    context.addIssue({ code: 'custom', message: 'Usa + y código de país, con 8–15 dígitos.' })
    return z.NEVER
  }
  return phone
})

export const contactInput = z.object({
  phone: optionalPhone,
  whatsapp: optionalPhone,
}).strict()

export type BusinessContact = { phone: string | null; whatsapp: string | null }

/** Explicit public allowlist; never project actor, bank or customer data. */
export function contactDTO(row?: BusinessContact): BusinessContact {
  return { phone: row?.phone ?? null, whatsapp: row?.whatsapp ?? null }
}
