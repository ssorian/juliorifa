import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { raffles, draws } from '../db/schema'
import { purchases, orderTickets } from '../../purchases/db/schema'
import { performDraw } from './draw-repository'
import type { DrawDatabase } from './draw-repository'

export const automaticDrawBatch = 10
/** Filter BEFORE limit: blocked/empty raffles cannot starve ready ones.
 * Expired awaiting_proof is eligible for the existing transactional expiry.
 * Reviewing is never cancelled. performDraw rechecks everything under locks.
 */
export async function eligibleDraws(
  database: DrawDatabase,
  now: Date,
  limit = automaticDrawBatch,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25)
    throw new Error('INVALID_BATCH')
  const rows = await database
    .select({ id: raffles.id })
    .from(raffles)
    .where(
      sql`
    ${raffles.status} in ('active','paused','scheduled','closed')
    and ${raffles.salesDeadline} <= ${now}
    and coalesce(${raffles.drawAt}, ${raffles.salesDeadline}) <= ${now}
    and not exists (select 1 from ${draws} where ${draws.raffleId} = ${raffles.id})
    and not exists (select 1 from ${purchases}
      where ${purchases.raffleId} = ${raffles.id}
      and (${purchases.status} = 'reviewing'
        or (${purchases.status} = 'awaiting_proof' and ${purchases.expiresAt} > ${now})))
    and exists (select 1 from ${purchases} inner join ${orderTickets}
      on ${orderTickets.orderId} = ${purchases.id}
      where ${purchases.raffleId} = ${raffles.id} and ${purchases.status} = 'paid')
  `,
    )
    .orderBy(raffles.salesDeadline, raffles.id)
    .limit(limit)
  return rows.map((row) => row.id)
}
export async function runAutomaticDraws(
  database: DrawDatabase,
  clock = () => Date.now(),
  limit = automaticDrawBatch,
) {
  const ids = await eligibleDraws(database, new Date(clock()), limit)
  const counts = { completed: 0, deferred: 0, failed: 0 }
  for (const id of ids) {
    try {
      // Null means system source; no client-supplied source or human credentials.
      await performDraw(database, id, null, clock)
      counts.completed++
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (
        [
          'UNRESOLVED_PURCHASES',
          'NO_CANDIDATES',
          'DRAW_TOO_EARLY',
          'INVALID_DRAW_STATE',
        ].includes(code)
      )
        counts.deferred++
      else counts.failed++
    }
  }
  return counts
}
