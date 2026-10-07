import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, isNull, lt, lte, gte, or, inArray } from 'drizzle-orm'
import type { db } from '../../db'
import { notificationOutbox as events } from './db/schema'
import { MAX_ATTEMPTS, LEASE_MS, retryDelay } from './domain'
import { DomainError } from '../purchases/domain'

export type OutboxDatabase = Pick<
  typeof db,
  'transaction' | 'select' | 'update'
>
export function createOutboxRepository(database: OutboxDatabase) {
  return {
    async claim(limit: number, now: number) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 25)
        throw new DomainError('INVALID_BATCH')
      return database.transaction(async (tx) => {
        const availableLease = or(
          isNull(events.leaseUntil),
          lte(events.leaseUntil, new Date(now)),
        )
        const exhausted = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              isNull(events.sentAt),
              isNull(events.deadAt),
              gte(events.attempts, MAX_ATTEMPTS),
              availableLease,
            ),
          )
          .orderBy(events.id)
          .limit(limit)
          .for('update', { skipLocked: true })
        for (const event of exhausted)
          await tx
            .update(events)
            .set({
              status: 'dead',
              deadAt: new Date(now),
              leaseToken: null,
              leaseUntil: null,
              lastError: 'LEASE_EXHAUSTED',
            })
            .where(eq(events.id, event.id))
        const rows = await tx
          .select()
          .from(events)
          .where(
            and(
              isNull(events.sentAt),
              isNull(events.deadAt),
              lt(events.attempts, MAX_ATTEMPTS),
              lte(events.availableAt, new Date(now)),
              availableLease,
              inArray(events.status, ['ready', 'leased']),
            ),
          )
          .orderBy(events.availableAt, events.id)
          .limit(limit)
          .for('update', { skipLocked: true })
        const claims = []
        for (const row of rows) {
          const [claim] = await tx
            .update(events)
            .set({
              status: 'leased',
              leaseToken: randomUUID(),
              leaseUntil: new Date(now + LEASE_MS),
              attempts: row.attempts + 1,
            })
            .where(eq(events.id, row.id))
            .returning()
          claims.push(claim)
        }
        return claims
      })
    },
    async sent(id: string, token: string, now: number) {
      const rows = await database
        .update(events)
        .set({
          status: 'sent',
          sentAt: new Date(now),
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
        })
        .where(
          and(
            eq(events.id, id),
            eq(events.leaseToken, token),
            eq(events.status, 'leased'),
          ),
        )
        .returning({ id: events.id })
      return rows.length === 1
    },
    async failed(
      id: string,
      token: string,
      attempt: number,
      code: string,
      now: number,
    ) {
      const dead = attempt >= MAX_ATTEMPTS
      const rows = await database
        .update(events)
        .set({
          status: dead ? 'dead' : 'ready',
          deadAt: dead ? new Date(now) : null,
          lastError: code,
          availableAt: new Date(now + retryDelay(attempt)),
          leaseToken: null,
          leaseUntil: null,
        })
        .where(
          and(
            eq(events.id, id),
            eq(events.leaseToken, token),
            eq(events.status, 'leased'),
          ),
        )
        .returning({ id: events.id })
      return rows.length === 1
    },
    async retry(id: string, now: number) {
      return database.transaction(async (tx) => {
        const rows = await tx
            .select()
            .from(events)
            .where(eq(events.id, id))
            .for('update'),
          event = rows.at(0)
        if (!event) throw new DomainError('NOT_FOUND')
        if (event.sentAt) throw new DomainError('ALREADY_SENT')
        if (event.leaseUntil && event.leaseUntil.getTime() > now)
          throw new DomainError('EVENT_BUSY')
        await tx
          .update(events)
          .set({
            status: 'ready',
            attempts: 0,
            availableAt: new Date(now),
            deadAt: null,
            leaseToken: null,
            leaseUntil: null,
            lastError: null,
          })
          .where(eq(events.id, id))
        return { id, status: 'ready' as const }
      })
    },
  }
}
export type OutboxRepository = ReturnType<typeof createOutboxRepository>
