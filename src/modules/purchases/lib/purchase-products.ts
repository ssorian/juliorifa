import { desc, eq, inArray, sql } from 'drizzle-orm'
import { raffles } from '../../raffles/db/schema'
import { mediaAssets } from '../../../lib/storage/db'
import { purchases, orderTickets } from '../db/schema'
import { purchaseDTO } from '../repository'
import type { Transaction } from '../repository'

// Two reads per page, never one detail/catalog request per order or ticket.
export async function listOwnProducts(
  reader: Pick<Transaction, 'select'>,
  actorId: string,
  offset: number,
  limit: number,
) {
  const rows = await reader.select({
    order: purchases,
    title: raffles.title,
    imageId: sql<string | null>`case when ${raffles.status} not in ('draft', 'archived') then (
      select ${mediaAssets.id} from jsonb_array_elements(${raffles.images}) with ordinality as attached(image, position)
      join ${mediaAssets} on ${mediaAssets.key} = attached.image->>'key'
      where ${mediaAssets.raffleId} = ${raffles.id}
        and ${mediaAssets.kind} = 'image' and ${mediaAssets.status} = 'verified'
      order by attached.position limit 1
    ) end`,
  }).from(purchases).innerJoin(raffles, eq(raffles.id, purchases.raffleId))
    .where(eq(purchases.userId, actorId))
    .orderBy(desc(purchases.createdAt), desc(purchases.id)).offset(offset).limit(limit)
  if (!rows.length) return []
  const tickets = await reader.select({ orderId: orderTickets.orderId, number: orderTickets.ticketNumber })
    .from(orderTickets).where(inArray(orderTickets.orderId, rows.map(row => row.order.id)))
    .orderBy(orderTickets.ticketNumber)
  const numbers = new Map<string, number[]>()
  for (const ticket of tickets) {
    const bucket = numbers.get(ticket.orderId) ?? []
    bucket.push(ticket.number)
    numbers.set(ticket.orderId, bucket)
  }
  return rows.map(({ order, title, imageId }) => ({
    ...purchaseDTO(order, numbers.get(order.id) ?? []),
    raffleTitle: title,
    raffleImageUrl: imageId ? `/api/media/images/${imageId}` : null,
  }))
}
