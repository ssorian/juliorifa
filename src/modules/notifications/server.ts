import { createServerFn } from '@tanstack/react-start'
import { count } from 'drizzle-orm'
import { db } from '../../db'
import { notificationOutbox } from './db/schema'
import { mediaAssets } from '../../lib/storage/db'
import { requireAdmin } from '../auth/services/authorization'
import { safe } from '../purchases/repository'
import { idInput, pageInput } from '../raffles/schemas/backend'
import { jobsInput } from './schemas'
import { createOutboxRepository } from './repository'
import { runJobs } from './jobs'

export const adminOutboxStatus = createServerFn({ method: 'GET' })
  .inputValidator(pageInput)
  .handler(({ data }) =>
    safe(async () => {
      await requireAdmin()
      const rows = await db
        .select({
          id: notificationOutbox.id,
          event: notificationOutbox.event,
          status: notificationOutbox.status,
          attempts: notificationOutbox.attempts,
          availableAt: notificationOutbox.availableAt,
          sentAt: notificationOutbox.sentAt,
          deadAt: notificationOutbox.deadAt,
          leaseUntil: notificationOutbox.leaseUntil,
          lastError: notificationOutbox.lastError,
        })
        .from(notificationOutbox)
        .orderBy(notificationOutbox.createdAt, notificationOutbox.id)
        .offset(data.offset)
        .limit(data.limit)
      return rows.map((r) => ({
        ...r,
        status: r.sentAt ? 'sent' : r.status,
        availableAt: r.availableAt.toISOString(),
        sentAt: r.sentAt?.toISOString() ?? null,
        deadAt: r.deadAt?.toISOString() ?? null,
        leaseUntil: r.leaseUntil?.toISOString() ?? null,
      }))
    }),
  )
export const adminOutboxCounts = createServerFn({ method: 'GET' }).handler(() =>
  safe(async () => {
    await requireAdmin()
    return db
      .select({
        status: notificationOutbox.status,
        attempts: notificationOutbox.attempts,
        total: count(),
      })
      .from(notificationOutbox)
      .groupBy(notificationOutbox.status, notificationOutbox.attempts)
  }),
)
export const retryOutboxEvent = createServerFn({ method: 'POST' })
  .inputValidator(idInput)
  .handler(({ data }) =>
    safe(async () => {
      await requireAdmin()
      return createOutboxRepository(db).retry(data.id, Date.now())
    }),
  )
export const runAdminJobs = createServerFn({ method: 'POST' })
  .inputValidator(jobsInput)
  .handler(({ data }) =>
    safe(async () => {
      await requireAdmin()
      return runJobs(data)
    }),
  )
export const adminStorageStatus = createServerFn({ method: 'GET' })
  .inputValidator(pageInput)
  .handler(({ data }) =>
    safe(async () => {
      await requireAdmin()
      const rows = await db
        .select({
          id: mediaAssets.id,
          kind: mediaAssets.kind,
          status: mediaAssets.status,
          attempts: mediaAssets.cleanupAttempts,
          error: mediaAssets.cleanupError,
          leaseUntil: mediaAssets.cleanupUntil,
          deadAt: mediaAssets.cleanupDeadAt,
        })
        .from(mediaAssets)
        .orderBy(mediaAssets.createdAt, mediaAssets.id)
        .offset(data.offset)
        .limit(data.limit)
      return rows.map((r) => ({
        ...r,
        leaseUntil: r.leaseUntil?.toISOString() ?? null,
        deadAt: r.deadAt?.toISOString() ?? null,
      }))
    }),
  )
