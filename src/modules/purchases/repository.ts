import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, lte } from 'drizzle-orm'
import type { db } from '../../db'
import { raffles } from '../raffles/db/schema'
import { purchases, occupancy, purchaseEvents, orderTickets } from './db/schema'
import { DomainError } from './domain'
import type { PurchaseDTO } from './types'

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
// Read-only recovery: scope in SQL, no public raffle visibility or expiry writes.
export async function findOwnReservationByKey(
  reader: Pick<Transaction, 'select'>,
  actorId: string,
  key: string,
) {
  const orders = await reader
    .select()
    .from(purchases)
    .where(
      and(eq(purchases.userId, actorId), eq(purchases.idempotencyKey, key)),
    )
    .limit(1)
  const order = orders.at(0)
  if (!order) return null
  const tickets = await reader
    .select({ number: orderTickets.ticketNumber })
    .from(orderTickets)
    .where(eq(orderTickets.orderId, order.id))
    .orderBy(orderTickets.ticketNumber)
  return purchaseDTO(
    order,
    tickets.map((ticket) => ticket.number),
  )
}
// All writers lock raffle first, then its order(s); release never removes order history.
export async function lockRaffle(tx: Transaction, id: string) {
  const rows = await tx
    .select()
    .from(raffles)
    .where(eq(raffles.id, id))
    .for('update')
  const raffle = rows.at(0)
  if (!raffle) throw new DomainError('NOT_FOUND')
  return raffle
}
export async function expireReservations(
  tx: Transaction,
  raffleId: string | string[],
  now: Date,
  limit = 1000000,
) {
  const expired = await tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        Array.isArray(raffleId)
          ? inArray(purchases.raffleId, raffleId)
          : eq(purchases.raffleId, raffleId),
        eq(purchases.status, 'awaiting_proof'),
        lte(purchases.expiresAt, now),
      ),
    )
    .orderBy(purchases.id)
    .limit(limit)
    .for('update')
  for (const order of expired) {
    await tx
      .update(purchases)
      .set({ status: 'expired', updatedAt: now })
      .where(eq(purchases.id, order.id))
    await tx
      .delete(occupancy)
      .where(
        and(eq(occupancy.orderId, order.id), eq(occupancy.state, 'reserved')),
      )
    await tx.insert(purchaseEvents).values({
      id: randomUUID(),
      orderId: order.id,
      type: 'expired',
      createdAt: now,
    })
  }
  return expired.length
}
export function purchaseDTO(
  p: typeof purchases.$inferSelect,
  tickets: number[],
): PurchaseDTO {
  return {
    id: p.id,
    raffleId: p.raffleId,
    status: p.status,
    priceCents: p.priceCents,
    feeBps: p.feeBps,
    subtotalCents: p.subtotalCents,
    feeCents: p.feeCents,
    totalCents: p.totalCents,
    tickets,
    expiresAt: p.expiresAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    proofReceivedAt: p.proofReceivedAt?.toISOString() ?? null,
    paymentInstructions: p.paymentSnapshot,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
  }
}
export async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof DomainError) throw new Error(error.code)
    throw new Error('BACKEND_UNAVAILABLE')
  }
}
