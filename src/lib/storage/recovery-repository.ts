import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, isNull, lte, lt, or, inArray, sql } from 'drizzle-orm'
import type { db } from '../../db'
import { mediaAssets as assets } from './db'
import { raffles } from '../../modules/raffles/db/schema'
import { purchases } from '../../modules/purchases/db/schema'
import { DomainError } from '../../modules/purchases/domain'
import { retryDelay, LEASE_MS, MAX_ATTEMPTS } from './retry'
import { canClean } from './recovery-domain'

export type RecoveryDatabase = Pick<
  typeof db,
  'select' | 'transaction' | 'update'
>
export function createRecoveryRepository(database: RecoveryDatabase) {
  return {
    async claim(limit: number, now: number) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 25)
        throw new DomainError('INVALID_BATCH')
      const candidates = await database
        .select()
        .from(assets)
        .where(
          and(
            lt(assets.createdAt, new Date(now - 86400000)),
            isNull(assets.cleanupDeadAt),
            lte(assets.cleanupAvailableAt, new Date(now)),
            or(
              isNull(assets.cleanupUntil),
              lte(assets.cleanupUntil, new Date(now)),
            ),
            or(
              inArray(assets.status, ['pending', 'orphan', 'cleaning']),
              and(eq(assets.status, 'verified'), eq(assets.kind, 'image')),
            ),
            sql`not exists (select 1 from ${purchases} where ${purchases.proofAssetId}=${assets.id})`,
            sql`not exists (select 1 from ${raffles}, jsonb_array_elements(${raffles.images}) as image where ${raffles.id}=${assets.raffleId} and image->>'key'=${assets.key})`,
          ),
        )
        .orderBy(assets.createdAt, assets.id)
        .limit(limit)
      const claims = []
      for (const candidate of candidates) {
        const claim = await database.transaction(async (tx) => {
          let raffleId = candidate.raffleId
          if (candidate.purchaseId) {
            const orders = await tx
              .select({ raffleId: purchases.raffleId })
              .from(purchases)
              .where(eq(purchases.id, candidate.purchaseId))
            raffleId = orders.at(0)?.raffleId ?? null
          }
          if (!raffleId) return null
          const parents = await tx
              .select()
              .from(raffles)
              .where(eq(raffles.id, raffleId))
              .for('update', { skipLocked: true }),
            raffle = parents.at(0)
          if (!raffle) return null
          if (candidate.purchaseId)
            await tx
              .select({ id: purchases.id })
              .from(purchases)
              .where(eq(purchases.id, candidate.purchaseId))
              .for('update')
          const rows = await tx
              .select()
              .from(assets)
              .where(eq(assets.id, candidate.id))
              .for('update', { skipLocked: true }),
            asset = rows.at(0)
          if (
            !asset ||
            asset.cleanupDeadAt ||
            asset.cleanupAvailableAt.getTime() > now
          )
            return null
          const attached = await tx
            .select({ id: purchases.id })
            .from(purchases)
            .where(eq(purchases.proofAssetId, asset.id))
            .limit(1)
          if (
            !canClean(
              {
                kind: asset.kind,
                status: asset.status,
                createdAt: asset.createdAt.getTime(),
                leaseUntil: asset.cleanupUntil?.getTime() ?? null,
                proofAttached: attached.length > 0,
                imageAttached: raffle.images.some((i) => i.key === asset.key),
              },
              now,
            )
          )
            return null
          if (asset.cleanupAttempts >= MAX_ATTEMPTS) {
            await tx
              .update(assets)
              .set({
                status: 'orphan',
                cleanupDeadAt: new Date(now),
                cleanupToken: null,
                cleanupUntil: null,
                cleanupError: 'LEASE_EXHAUSTED',
              })
              .where(eq(assets.id, asset.id))
            return null
          }
          const [claimed] = await tx
            .update(assets)
            .set({
              status: 'cleaning',
              cleanupToken: randomUUID(),
              cleanupUntil: new Date(now + LEASE_MS),
              cleanupAttempts: asset.cleanupAttempts + 1,
            })
            .where(eq(assets.id, asset.id))
            .returning()
          return claimed
        })
        if (claim) claims.push(claim)
      }
      return claims
    },
    async deleted(id: string, token: string) {
      const rows = await database
        .update(assets)
        .set({
          status: 'deleted',
          cleanupToken: null,
          cleanupUntil: null,
          cleanupError: null,
        })
        .where(
          and(
            eq(assets.id, id),
            eq(assets.cleanupToken, token),
            eq(assets.status, 'cleaning'),
          ),
        )
        .returning({ id: assets.id })
      return rows.length === 1
    },
    async failed(
      id: string,
      token: string,
      attempt: number,
      code: string,
      now: number,
    ) {
      const rows = await database
        .update(assets)
        .set({
          status: 'orphan',
          cleanupToken: null,
          cleanupUntil: null,
          cleanupError: code,
          cleanupAvailableAt: new Date(now + retryDelay(attempt)),
          cleanupDeadAt: attempt >= MAX_ATTEMPTS ? new Date(now) : null,
        })
        .where(
          and(
            eq(assets.id, id),
            eq(assets.cleanupToken, token),
            eq(assets.status, 'cleaning'),
          ),
        )
        .returning({ id: assets.id })
      return rows.length === 1
    },
  }
}
export type RecoveryRepository = ReturnType<typeof createRecoveryRepository>
