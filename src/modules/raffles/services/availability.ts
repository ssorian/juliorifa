import '@tanstack/react-start/server-only'
import { randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { db } from '../../../db'
import { DomainError } from '../../purchases/domain'
import { lockRaffle, expireReservations } from '../../purchases/repository'
import { isPublic } from '../lib/backend-policy'
import { availabilityInput } from '../schemas/backend'
import type { z } from 'zod'

export type AvailabilityDatabase = Pick<typeof db, 'transaction'>

// All counts and ranks share the raffle lock used by inventory writers.
// Work scales with occupancy; never materialize the million-ticket universe.
export async function readAvailability(
  database: AvailabilityDatabase,
  input: z.input<typeof availabilityInput>,
  clock = () => Date.now(),
  random: (max: number) => number = randomInt,
  includeSuggestions = true,
) {
  const { id, limit, exclude } = availabilityInput.parse(input)
  return database.transaction(async tx => {
    const raffle = await lockRaffle(tx, id)
    if (!isPublic(raffle.status)) throw new DomainError('NOT_FOUND')
    const start = raffle.startNumber, end = start + raffle.ticketCount - 1
    if (exclude.some(n => n < start || n > end)) throw new DomainError('INVALID_RANGE')
    const now = new Date(clock())
    await expireReservations(tx, id, now)
    const exclusions = sql`ARRAY[${sql.join(exclude.map(n => sql`${n}::integer`), sql`, `)}]::integer[]`
    const counts = await tx.execute(sql`
      SELECT count(*)::integer AS occupied,
        count(*) FILTER (WHERE state = 'sold')::integer AS sold,
        count(*) FILTER (WHERE ticket_number = ANY(${exclusions}))::integer AS excluded_occupied
      FROM ticket_occupancy WHERE raffle_id = ${id}::uuid
    `)
    const row = counts.rows[0] as { occupied:number; sold:number; excluded_occupied:number }
    const available = raffle.ticketCount - row.occupied
    const eligible = available - exclude.length + row.excluded_occupied
    const salesOpen = raffle.status === 'active' && now < raffle.salesDeadline
    const suggestions: number[] = []
    if (includeSuggestions && salesOpen && eligible > 0) {
      // Floyd's bounded sampling: distinct zero-based ranks without retries.
      const ranks = new Set<number>()
      for (let j = eligible - Math.min(limit, eligible); j < eligible; j++) {
        const candidate = random(j + 1)
        ranks.add(ranks.has(candidate) ? j : candidate)
      }
      const ranksSQL = sql`ARRAY[${sql.join([...ranks].map(n => sql`${n}::integer`), sql`, `)}]::integer[]`
      const result = await tx.execute(sql`
        WITH barriers AS (
          SELECT ticket_number::bigint AS n FROM ticket_occupancy WHERE raffle_id = ${id}::uuid
          UNION SELECT unnest(${exclusions})::bigint
          UNION SELECT ${start - 1}::bigint
          UNION SELECT ${end + 1}::bigint
        ), intervals AS (
          SELECT lag(n) OVER (ORDER BY n) + 1 AS first, n - lag(n) OVER (ORDER BY n) - 1 AS size
          FROM barriers
        ), gaps AS (
          SELECT first, size, sum(size) OVER (ORDER BY first) AS cumulative
          FROM intervals WHERE size > 0
        )
        SELECT (first + rank - (cumulative - size))::integer AS number
        FROM gaps JOIN unnest(${ranksSQL}) AS ranks(rank)
          ON rank >= cumulative - size AND rank < cumulative
        ORDER BY number
      `)
      suggestions.push(...result.rows.map(r => Number(r.number)))
    }
    return { salesOpen, ticketCount:raffle.ticketCount, available, sold:row.sold, eligible, suggestions }
  })
}
