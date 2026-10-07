import '@tanstack/react-start/server-only'
import { sendEmail, EmailDeliveryError } from '../../lib/email/service'
import { DomainError } from '../purchases/domain'
import { MAX_ATTEMPTS, eventKey } from './domain'
import type { notificationOutbox } from './db/schema'
import type { OutboxRepository } from './repository'

export async function processOutbox(
  repo: OutboxRepository,
  prepare: (
    event: typeof notificationOutbox.$inferSelect,
  ) => Promise<{ to: string; subject: string; text: string }>,
  send: typeof sendEmail = sendEmail,
  batch = 10,
  clock = () => Date.now(),
) {
  const rows = await repo.claim(batch, clock())
  const result = { claimed: rows.length, sent: 0, retry: 0, dead: 0, stale: 0 }
  for (let start = 0; start < rows.length; start += 5) {
    await Promise.all(
      rows.slice(start, start + 5).map(async (row) => {
        if (!row.leaseToken) throw new DomainError('LEASE_INVARIANT')
        try {
          const message = await prepare(row)
          await send({ ...message, idempotencyKey: eventKey(row.id) })
          if (await repo.sent(row.id, row.leaseToken, clock())) result.sent++
          else result.stale++
        } catch (error) {
          const code =
            error instanceof EmailDeliveryError || error instanceof DomainError
              ? error.code
              : 'DELIVERY_UNAVAILABLE'
          if (
            await repo.failed(
              row.id,
              row.leaseToken,
              row.attempts,
              code,
              clock(),
            )
          ) {
            if (row.attempts >= MAX_ATTEMPTS) result.dead++
            else result.retry++
          } else result.stale++
        }
      }),
    )
  }
  return result
}
