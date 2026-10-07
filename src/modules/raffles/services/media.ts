import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { eq, and, gt } from 'drizzle-orm'
import { db } from '../../../db'
import { storageConfig } from '../../../config/storage'
import { createStorage } from '../../../lib/storage/s3'
import { mediaAssets, uploadLeases } from '../../../lib/storage/db'
import { claimOrphan, markDeleted } from '../../../lib/storage/assets'
import {
  readBoundedBody,
  validateFile,
  limits,
} from '../../../lib/storage/validation'
import { uploadVerified } from '../../../lib/storage/upload'
import { withUploadGuard } from '../../../lib/storage/guard'
import { createUploadGuard } from '../../../lib/storage/guard-repository'
import { requireAdmin } from '../../auth/services/authorization'
import { raffles } from '../db/schema'
import { isPublic } from '../lib/backend-policy'
import { lockRaffle } from '../../purchases/repository'
import { DomainError } from '../../purchases/domain'

export async function uploadImage(id: string, request: Request) {
  const actor = await requireAdmin()
  const rows = await db.select().from(raffles).where(eq(raffles.id, id))
  const raffle = rows.at(0)
  if (!raffle) throw new DomainError('NOT_FOUND')
  if (['drawn', 'archived'].includes(raffle.status))
    throw new DomainError('RAFFLE_IMMUTABLE')
  return withUploadGuard(
    createUploadGuard(db),
    actor.id,
    id,
    'image',
    async (lease) => {
      const latestRows = await db
        .select({ status: raffles.status })
        .from(raffles)
        .where(eq(raffles.id, id))
      const latest = latestRows.at(0)
      if (!latest || ['drawn', 'archived'].includes(latest.status))
        throw new DomainError('RAFFLE_IMMUTABLE')
      const storage = createStorage(storageConfig())
      const file = await validateFile(
        await readBoundedBody(request, limits.image),
        request.headers.get('content-type') ?? '',
        'image',
      )
      await lease.assert()
      const assetId = randomUUID(),
        key = `images/${assetId}`
      await uploadVerified(storage, key, file.bytes, file.mime, {
        assertLease: lease.assert,
        async persistPending() {
          await db.insert(mediaAssets).values({
            id: assetId,
            key,
            kind: 'image',
            raffleId: id,
            ownerId: actor.id,
            mime: file.mime,
            sizeBytes: file.sizeBytes,
            digest: file.digest,
            width: file.width,
            height: file.height,
          })
        },
        async finalize() {
          return db.transaction(async (tx) => {
            const fresh = await lockRaffle(tx, id)
            if (['drawn', 'archived'].includes(fresh.status))
              throw new DomainError('RAFFLE_IMMUTABLE')
            const leases = await tx
              .select()
              .from(uploadLeases)
              .where(
                and(
                  eq(uploadLeases.kind, 'image'),
                  eq(uploadLeases.targetId, id),
                  eq(uploadLeases.ownerId, actor.id),
                  eq(uploadLeases.token, lease.token),
                  gt(uploadLeases.expiresAt, new Date()),
                ),
              )
              .for('update')
            if (!leases.at(0)) throw new DomainError('UPLOAD_LEASE_LOST')
            const assets = await tx
              .select()
              .from(mediaAssets)
              .where(eq(mediaAssets.id, assetId))
              .for('update')
            if (assets.at(0)?.status !== 'pending')
              throw new DomainError('INVALID_ASSET')
            await tx
              .update(mediaAssets)
              .set({ status: 'verified', verifiedAt: new Date() })
              .where(eq(mediaAssets.id, assetId))
            return true
          })
        },
        claimOrphan: () => claimOrphan(assetId),
        markDeleted: () => markDeleted(assetId),
      })
      return { id: assetId, key, mediaUrl: `/api/media/images/${assetId}` }
    },
  )
}
export async function imageURL(id: string) {
  const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id))
  const asset = rows.at(0)
  if (
    !asset ||
    asset.kind !== 'image' ||
    asset.status !== 'verified' ||
    !asset.verifiedAt ||
    !asset.raffleId ||
    asset.purchaseId
  )
    throw new DomainError('NOT_FOUND')
  const raffleRows = await db
    .select()
    .from(raffles)
    .where(eq(raffles.id, asset.raffleId))
  const raffle = raffleRows.at(0)
  if (!raffle) throw new DomainError('NOT_FOUND')
  if (
    !isPublic(raffle.status) ||
    !raffle.images.some((i) => i.key === asset.key)
  )
    await requireAdmin()
  return createStorage(storageConfig()).url(asset.key, 'image', asset.mime)
}
