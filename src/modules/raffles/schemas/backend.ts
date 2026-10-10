import { z } from 'zod'
import { raffleStates } from '../db/schema'

export const idInput = z.object({ id: z.uuid() }).strict()
export const pageInput = z
  .object({
    offset: z.int().min(0).max(100000).default(0),
    limit: z.int().min(1).max(100).default(50),
  })
  .strict()
export const adminListInput = pageInput
  .extend({
    search: z.string().trim().max(200).default(''),
    status: z
      .enum([
        'all',
        'draft',
        'active',
        'scheduled',
        'paused',
        'closed',
        'drawn',
        'archived',
        'awaiting_proof',
        'reviewing',
        'paid',
        'rejected',
        'expired',
        'cancelled',
      ])
      .default('all'),
    raffleId: z.uuid().optional(),
  })
  .strict()
const fields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000),
  status: z.enum(raffleStates).exclude(['drawn']),
  startNumber: z.int().min(0).max(2147483647).default(1),
  ticketCount: z.int().min(1).max(1000000),
  priceCents: z.int().min(1).max(2147483),
  feeBps: z.int().min(0).max(10000).default(0),
  prizeCostCents: z.int().min(0).max(2147483647).default(0),
  expensesCents: z.int().min(0).max(2147483647).default(0),
  salesDeadline: z.iso.datetime({ offset: true }),
  drawAt: z.iso.datetime({ offset: true }).optional(),
  features: z
    .array(
      z
        .object({
          title: z.string().max(200),
          description: z.string().max(2000),
        })
        .strict(),
    )
    .max(50),
  images: z
    .array(
      z
        .object({ key: z.string().min(1).max(512), alt: z.string().max(200) })
        .strict(),
    )
    .max(20),
}
function valid(data: {
  startNumber: number
  ticketCount: number
  drawAt?: string
  salesDeadline: string
}) {
  return (
    data.startNumber + data.ticketCount - 1 <= 2147483647 &&
    (!data.drawAt || Date.parse(data.drawAt) >= Date.parse(data.salesDeadline))
  )
}
export const raffleInput = z
  .object(fields)
  .strict()
  .refine(valid, { message: 'Invalid range or draw date' })
export const updateInput = z
  .object({ ...fields, id: z.uuid() })
  .strict()
  .refine(valid, { message: 'Invalid range or draw date' })
export const ticketsInput = z
  .object({
    raffleId: z.uuid(),
    tickets: z.array(z.int().min(0)).min(1).max(1000),
  })
  .strict()
export const availabilityInput = idInput.extend({
  limit: z.int().min(1).max(1000).default(8),
  exclude: z.array(z.int().min(0).max(2147483647)).max(1000).default([])
    .refine(numbers => new Set(numbers).size === numbers.length, 'Duplicate exclusions'),
}).strict()
export const inventoryInput = z
  .object({
    id: z.uuid(),
    from: z.int().min(0),
    limit: z.int().min(1).max(1000).default(100),
  })
  .strict()
