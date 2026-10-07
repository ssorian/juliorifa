import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { db } from '../../db'
import { uploadBudgets, uploadLeases } from './db'
import { DomainError } from '../../modules/purchases/domain'
import type { UploadGuardRepository } from './guard'

export type GuardDatabase = Pick<typeof db, 'transaction' | 'select' | 'update'>
export function createUploadGuard(
  database: GuardDatabase,
  clock = () => Date.now(),
): UploadGuardRepository {
  return {
    async claim(ownerId, targetId, kind) {
      return database.transaction(async (tx) => {
        const now = clock()
        await tx
          .insert(uploadBudgets)
          .values({ userId: ownerId, windowStart: new Date(now), attempts: 0 })
          .onConflictDoNothing()
        const [budget] = await tx
          .select()
          .from(uploadBudgets)
          .where(eq(uploadBudgets.userId, ownerId))
          .for('update')
        const reset = now - budget.windowStart.getTime() >= 60000,
          attempts = reset ? 0 : budget.attempts
        if (attempts >= 5) throw new DomainError('UPLOAD_RATE_LIMITED')
        if (budget.activeUntil && budget.activeUntil.getTime() > now)
          throw new DomainError('UPLOAD_BUSY')
        await tx
          .insert(uploadLeases)
          .values({
            kind,
            targetId,
            ownerId,
            token: randomUUID(),
            expiresAt: new Date(0),
          })
          .onConflictDoNothing()
        const [old] = await tx
          .select()
          .from(uploadLeases)
          .where(
            and(
              eq(uploadLeases.kind, kind),
              eq(uploadLeases.targetId, targetId),
            ),
          )
          .for('update')
        if (old.expiresAt.getTime() > now) throw new DomainError('UPLOAD_BUSY')
        const [lease] = await tx
          .update(uploadLeases)
          .set({
            ownerId,
            token: randomUUID(),
            expiresAt: new Date(now + 300000),
          })
          .where(
            and(
              eq(uploadLeases.kind, kind),
              eq(uploadLeases.targetId, targetId),
            ),
          )
          .returning()
        await tx
          .update(uploadBudgets)
          .set({
            activeToken: lease.token,
            activeUntil: lease.expiresAt,
            attempts: attempts + 1,
            windowStart: reset ? new Date(now) : budget.windowStart,
          })
          .where(eq(uploadBudgets.userId, ownerId))
        return lease
      })
    },
    async owns(lease) {
      const rows = await database
        .select({ token: uploadLeases.token })
        .from(uploadLeases)
        .innerJoin(
          uploadBudgets,
          and(
            eq(uploadBudgets.userId, uploadLeases.ownerId),
            eq(uploadBudgets.activeToken, uploadLeases.token),
            gt(uploadBudgets.activeUntil, new Date(clock())),
          ),
        )
        .where(
          and(
            eq(uploadLeases.kind, lease.kind),
            eq(uploadLeases.targetId, lease.targetId),
            eq(uploadLeases.ownerId, lease.ownerId),
            eq(uploadLeases.token, lease.token),
            gt(uploadLeases.expiresAt, new Date(clock())),
          ),
        )
      return rows.length === 1
    },
    async release(lease) {
      await database.transaction(async (tx) => {
        // Same order as admission: user budget first, then destination.
        await tx
          .update(uploadBudgets)
          .set({ activeToken: null, activeUntil: null })
          .where(
            and(
              eq(uploadBudgets.userId, lease.ownerId),
              eq(uploadBudgets.activeToken, lease.token),
            ),
          )
        await tx
          .update(uploadLeases)
          .set({ expiresAt: new Date(0) })
          .where(
            and(
              eq(uploadLeases.kind, lease.kind),
              eq(uploadLeases.targetId, lease.targetId),
              eq(uploadLeases.ownerId, lease.ownerId),
              eq(uploadLeases.token, lease.token),
            ),
          )
      })
    },
  }
}
