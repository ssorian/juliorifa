import '@tanstack/react-start/server-only'
import { eq, and, inArray, count, or, gt } from 'drizzle-orm'
import type { db } from '../../../db'
import { raffles } from '../../raffles/db/schema'
import { purchases, orderTickets, occupancy } from '../../purchases/db/schema'
import { computeFinance } from './finance-domain'

export type FinanceDatabase = Pick<typeof db, 'select' | 'transaction'>
export function finance(
  database: FinanceDatabase,
  now: number,
  raffleId?: string,
) {
  return database.transaction(
    async (tx) => {
      const costs = await tx
        .select({
          id: raffles.id,
          title: raffles.title,
          status: raffles.status,
          images: raffles.images,
          features: raffles.features,
          priceCents: raffles.priceCents,
          drawAt: raffles.drawAt,
          salesDeadline: raffles.salesDeadline,
          startNumber: raffles.startNumber,
          prizeCostCents: raffles.prizeCostCents,
          expensesCents: raffles.expensesCents,
          ticketCount: raffles.ticketCount,
        })
        .from(raffles)
        .where(raffleId ? eq(raffles.id, raffleId) : undefined)
      const orders = await tx
        .select({
          raffleId: purchases.raffleId,
          status: purchases.status,
          subtotalCents: purchases.subtotalCents,
          feeCents: purchases.feeCents,
          reviewedAt: purchases.reviewedAt,
          expiresAt: purchases.expiresAt,
          ticketCount: count(orderTickets.ticketNumber),
        })
        .from(purchases)
        .leftJoin(orderTickets, eq(orderTickets.orderId, purchases.id))
        .where(
          and(
            inArray(purchases.status, ['paid', 'reviewing', 'awaiting_proof']),
            raffleId ? eq(purchases.raffleId, raffleId) : undefined,
          ),
        )
        .groupBy(purchases.id)
      const stockRows = await tx
        .select({
          raffleId: occupancy.raffleId,
          state: occupancy.state,
          total: count(),
        })
        .from(occupancy)
        .leftJoin(purchases, eq(purchases.id, occupancy.orderId))
        .where(
          and(
            raffleId ? eq(occupancy.raffleId, raffleId) : undefined,
            or(
              inArray(occupancy.state, ['blocked', 'reviewing', 'sold']),
              and(
                eq(occupancy.state, 'reserved'),
                gt(purchases.expiresAt, new Date(now)),
              ),
            ),
          ),
        )
        .groupBy(occupancy.raffleId, occupancy.state)
      const total = costs.reduce((sum, r) => sum + r.ticketCount, 0)
      const stock = {
        total,
        available: total,
        reserved: 0,
        reviewing: 0,
        sold: 0,
        blocked: 0,
      }
      for (const row of stockRows) {
        stock[row.state] += row.total
        stock.available -= row.total
      }
      return {
        ...computeFinance(costs, orders, now, raffleId),
        stock,
        raffleCount: costs.length,
        raffles: costs.map((r) => {
          const counts = {
            available: r.ticketCount,
            reserved: 0,
            reviewing: 0,
            sold: 0,
            blocked: 0,
          }
          for (const row of stockRows.filter((row) => row.raffleId === r.id)) {
            counts[row.state] += row.total
            counts.available -= row.total
          }
          return {
            ...r,
            drawAt: (r.drawAt ?? r.salesDeadline).toISOString(),
            salesDeadline: r.salesDeadline.toISOString(),
            stock: counts,
            ...computeFinance([r], orders, now, r.id),
          }
        }),
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}
