import { z } from 'zod'
import { ticketsInput } from '../raffles/schemas/backend'

export const reserveInput = ticketsInput.extend({
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
})
export const reservationKeyInput = z
  .object({ idempotencyKey: reserveInput.shape.idempotencyKey })
  .strict()
export const reviewInput = z
  .object({ id: z.uuid(), reason: z.string().trim().min(1).max(2000) })
  .strict()
export const settingsInput = z
  .object({
    bank: z.string().trim().min(1).max(200),
    beneficiary: z.string().trim().min(1).max(200),
    account: z.string().trim().min(1).max(200),
    instructions: z.string().trim().min(1).max(4000),
  })
  .strict()
