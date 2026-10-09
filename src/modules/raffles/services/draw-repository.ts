import '@tanstack/react-start/server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { db } from '../../../db'
import { raffles, draws } from '../db/schema'
import {
  purchases,
  orderTickets,
  occupancy,
  purchaseEvents,
} from '../../purchases/db/schema'
import { expireReservations, lockRaffle } from '../../purchases/repository'
import { DomainError } from '../../purchases/domain'
import { chooseWinner, assertDrawReady } from './draw-domain'

export type DrawDatabase = Pick<typeof db, 'transaction' | 'select'>
export async function performDraw(
  database: DrawDatabase,
  id: string,
  actorId: string | null,
  clock = () => Date.now(),
  random: (max: number) => number = randomInt,
) {
  const result = await database.transaction(async (tx) => {
    const raffle = await lockRaffle(tx, id)
    const previous = await tx.select().from(draws).where(eq(draws.raffleId, id))
    if (previous.at(0)) return { draw: previous.at(0)! }
    const now = new Date(clock()),
      scheduled = raffle.drawAt ?? raffle.salesDeadline
    if (now < scheduled || now < raffle.salesDeadline)
      return { error: 'DRAW_TOO_EARLY' }
    if (['draft', 'archived', 'drawn'].includes(raffle.status))
      return { error: 'INVALID_DRAW_STATE' }
    await expireReservations(tx, id, now)
    await tx
      .update(raffles)
      .set({ status: 'closed', updatedAt: now })
      .where(eq(raffles.id, id))
    const orders = await tx
      .select()
      .from(purchases)
      .where(eq(purchases.raffleId, id))
      .orderBy(purchases.id)
      .for('update')
    if (
      orders.some(
        (o) => o.status === 'awaiting_proof' || o.status === 'reviewing',
      )
    )
      return { error: 'UNRESOLVED_PURCHASES' }
    const history = await tx
      .select({
        ticketNumber: orderTickets.ticketNumber,
        orderId: purchases.id,
        userId: purchases.userId,
      })
      .from(orderTickets)
      .innerJoin(purchases, eq(purchases.id, orderTickets.orderId))
      .where(and(eq(purchases.raffleId, id), eq(purchases.status, 'paid')))
      .orderBy(orderTickets.ticketNumber, purchases.id)
    const sold = await tx
      .select()
      .from(occupancy)
      .where(and(eq(occupancy.raffleId, id), eq(occupancy.state, 'sold')))
    const indexed = new Map(sold.map((t) => [t.ticketNumber, t.orderId]))
    if (
      history.length !== sold.length ||
      history.some(
        (t) =>
          indexed.get(t.ticketNumber) !== t.orderId ||
          t.ticketNumber < raffle.startNumber ||
          t.ticketNumber >= raffle.startNumber + raffle.ticketCount,
      )
    )
      throw new DomainError('INVENTORY_INVARIANT')
    if (!history.length) return { error: 'NO_CANDIDATES' }
    assertDrawReady(
      raffle.salesDeadline.getTime(),
      scheduled.getTime(),
      now.getTime(),
      orders.map((o) => o.status),
      history.length,
    )
    const selection = chooseWinner(history, random)
    const [draw] = await tx
      .insert(draws)
      .values({
        id: randomUUID(),
        raffleId: id,
        candidateDigest: selection.digest,
        candidateCount: selection.count,
        randomIndex: selection.index,
        algorithm: selection.algorithm,
        winnerTicket: selection.winner.ticketNumber,
        winnerOrderId: selection.winner.orderId,
        actorId,
        source: actorId === null ? 'automatic' : 'manual',
        createdAt: now,
      })
      .returning()
    await tx
      .update(raffles)
      .set({ status: 'drawn', updatedAt: now })
      .where(eq(raffles.id, id))
    await tx.insert(purchaseEvents).values({
      id: randomUUID(),
      orderId: selection.winner.orderId,
      actorId,
      type: 'winner',
      reason:
        actorId === null
          ? 'automatic:crypto-randomInt-v1'
          : 'crypto-randomInt-v1',
      createdAt: now,
    })
    return { draw }
  })
  // Refusals after expiry/closing must preserve that transaction's commit.
  if ('error' in result) throw new DomainError(result.error!)
  return result.draw
}
export function publicDrawDTO(draw: typeof draws.$inferSelect) {
  return {
    raffleId: draw.raffleId,
    winnerTicket: draw.winnerTicket,
    drawnAt: draw.createdAt.toISOString(),
    candidateCount: draw.candidateCount,
    candidateDigest: draw.candidateDigest,
    algorithm: draw.algorithm,
  }
}
