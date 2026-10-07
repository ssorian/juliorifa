import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { db } from '../../db'
import { user } from '../auth/db/schema'
import { purchases, paymentSettings } from '../purchases/db/schema'
import { raffles, draws } from '../raffles/db/schema'
import type { notificationOutbox } from './db/schema'
import { deliveryTemplate } from './domain'
import { DomainError } from '../purchases/domain'

const payloadSchema = z
  .object({
    orderId: z.uuid(),
    userId: z.string().min(1),
    reason: z.string().max(2000).optional(),
    raffleId: z.uuid().optional(),
    winnerTicket: z.int().min(0).optional(),
  })
  .strict()
export async function prepareDelivery(
  database: Pick<typeof db, 'select'>,
  event: typeof notificationOutbox.$inferSelect,
  origin: string,
) {
  const parsed = payloadSchema.safeParse(event.payload)
  if (!parsed.success) throw new DomainError('INVALID_EVENT_PAYLOAD')
  const payload = parsed.data
  const rows = await database
    .select({ order: purchases, owner: user, raffle: raffles })
    .from(purchases)
    .innerJoin(user, eq(user.id, purchases.userId))
    .innerJoin(raffles, eq(raffles.id, purchases.raffleId))
    .where(eq(purchases.id, payload.orderId))
  const row = rows.at(0)
  if (!row || row.order.userId !== payload.userId)
    throw new DomainError('RECIPIENT_NOT_FOUND')
  if (!row.owner.emailVerified) throw new DomainError('RECIPIENT_UNVERIFIED')
  if (event.event === 'purchase.approved' && row.order.status !== 'paid')
    throw new DomainError('EVENT_STATE_MISMATCH')
  if (event.event === 'purchase.rejected' && row.order.status !== 'rejected')
    throw new DomainError('EVENT_STATE_MISMATCH')
  if (event.event === 'raffle.winner') {
    const records = await database
        .select()
        .from(draws)
        .where(eq(draws.raffleId, row.raffle.id)),
      record = records.at(0)
    if (
      !record ||
      record.winnerOrderId !== row.order.id ||
      payload.raffleId !== record.raffleId ||
      payload.winnerTicket !== record.winnerTicket
    )
      throw new DomainError('EVENT_STATE_MISMATCH')
  }
  let beneficiary = row.order.paymentSnapshot?.beneficiary
  if (!beneficiary && event.event === 'raffle.winner') {
    const settings = await database
      .select({ beneficiary: paymentSettings.beneficiary })
      .from(paymentSettings)
      .where(eq(paymentSettings.id, 1))
    beneficiary = settings.at(0)?.beneficiary
    if (!beneficiary) throw new DomainError('PAYMENT_NOT_CONFIGURED')
  }
  const message = deliveryTemplate(event.event, {
    title: row.raffle.title,
    ticket: payload.winnerTicket,
    reason: payload.reason ?? '',
    beneficiary: beneficiary ?? '',
    origin,
  })
  return { ...message, to: row.owner.email }
}
