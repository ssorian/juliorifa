import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { storageConfig } from '../../config/storage'
import { createStorage } from '../../lib/storage/s3'
import { mediaAssets } from '../../lib/storage/db'
import { claimOrphan, markDeleted } from '../../lib/storage/assets'
import {
  readBoundedBody,
  validateFile,
  limits,
} from '../../lib/storage/validation'
import { uploadVerified } from '../../lib/storage/upload'
import { withUploadGuard } from '../../lib/storage/guard'
import { createUploadGuard } from '../../lib/storage/guard-repository'
import {
  requireClient,
  requireAdmin,
  requireUser,
} from '../auth/services/authorization'
import { purchases, purchaseEvents } from './db/schema'
import { DomainError } from './domain'
import { finalizeWithRepository, reviewWithRepository } from './workflow'
import { createWorkflowRepository } from './workflow-repository'

export async function uploadProof(id: string, request: Request) {
  const actor = await requireClient()
  const rows = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.userId, actor.id)))
  const order = rows.at(0)
  if (!order) throw new DomainError('NOT_FOUND')
  if (order.status !== 'awaiting_proof')
    throw new DomainError('CANNOT_UPLOAD_PROOF')
  if (Date.now() >= order.expiresAt.getTime()) {
    await finalizeWithRepository(
      createWorkflowRepository(db, {
        orderId: id,
        raffleId: order.raffleId,
        actorId: actor.id,
        now: Date.now(),
      }),
      actor.id,
      () => Date.now(),
    )
    throw new DomainError('RESERVATION_EXPIRED') // Outside tx: expiry/release already committed.
  }
  return withUploadGuard(
    createUploadGuard(db),
    actor.id,
    id,
    'proof',
    async (lease) => {
      const latestRows = await db
        .select({ status: purchases.status, expiresAt: purchases.expiresAt })
        .from(purchases)
        .where(and(eq(purchases.id, id), eq(purchases.userId, actor.id)))
      const latest = latestRows.at(0)
      if (latest?.status !== 'awaiting_proof')
        throw new DomainError('CANNOT_UPLOAD_PROOF')
      if (Date.now() >= latest.expiresAt.getTime()) {
        await finalizeWithRepository(
          createWorkflowRepository(db, {
            orderId: id,
            raffleId: order.raffleId,
            actorId: actor.id,
            now: Date.now(),
          }),
          actor.id,
          () => Date.now(),
        )
        throw new DomainError('RESERVATION_EXPIRED')
      }
      const storage = createStorage(storageConfig())
      const file = await validateFile(
        await readBoundedBody(request, limits.proof),
        request.headers.get('content-type') ?? '',
        'proof',
      )
      await lease.assert()
      const assetId = randomUUID(),
        key = `proofs/${assetId}`
      await uploadVerified(storage, key, file.bytes, file.mime, {
        assertLease: lease.assert,
        async persistPending() {
          await db.insert(mediaAssets).values({
            id: assetId,
            key,
            kind: 'proof',
            purchaseId: id,
            ownerId: actor.id,
            mime: file.mime,
            sizeBytes: file.sizeBytes,
            digest: file.digest,
            width: file.width,
            height: file.height,
          })
        },
        async finalize() {
          const result = await finalizeWithRepository(
            createWorkflowRepository(db, {
              orderId: id,
              raffleId: order.raffleId,
              actorId: actor.id,
              now: Date.now(),
              assetId,
              uploadToken: lease.token,
            }),
            actor.id,
            () => Date.now(),
          )
          return result.status === 'reviewing'
        },
        claimOrphan: () => claimOrphan(assetId),
        markDeleted: () => markDeleted(assetId),
      })
      return { id, status: 'reviewing' as const }
    },
  )
}
export async function proofURL(id: string) {
  const actor = await requireUser()
  const rows = await db
    .select()
    .from(purchases)
    .where(
      actor.role === 'admin'
        ? eq(purchases.id, id)
        : and(eq(purchases.id, id), eq(purchases.userId, actor.id)),
    )
  const order = rows.at(0)
  if (!order?.proofAssetId) throw new DomainError('NOT_FOUND')
  const assets = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, order.proofAssetId))
  const asset = assets.at(0)
  if (
    !asset ||
    asset.kind !== 'proof' ||
    asset.status !== 'verified' ||
    !asset.verifiedAt ||
    asset.purchaseId !== id ||
    asset.ownerId !== order.userId ||
    asset.key !== `proofs/${asset.id}` ||
    asset.key !== order.proofKey ||
    asset.digest !== order.proofDigest ||
    !order.proofReceivedAt ||
    order.proofReceivedAt >= order.expiresAt
  )
    throw new DomainError('NOT_FOUND')
  return createStorage(storageConfig()).url(asset.key, 'proof', asset.mime)
}
export async function review(
  id: string,
  target: 'paid' | 'rejected',
  reason: string,
) {
  const actor = await requireAdmin()
  const rows = await db
    .select({ raffleId: purchases.raffleId })
    .from(purchases)
    .where(eq(purchases.id, id))
  const order = rows.at(0)
  if (!order) throw new DomainError('NOT_FOUND')
  const result = await reviewWithRepository(
    createWorkflowRepository(db, {
      orderId: id,
      raffleId: order.raffleId,
      actorId: actor.id,
      now: Date.now(),
    }),
    actor.role,
    target,
    reason,
    () => Date.now(),
  )
  return { id, ...result }
}
export async function auditEvents(id: string) {
  const actor = await requireUser()
  const rows = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      actor.role === 'admin'
        ? eq(purchases.id, id)
        : and(eq(purchases.id, id), eq(purchases.userId, actor.id)),
    )
  if (!rows.at(0)) throw new DomainError('NOT_FOUND')
  const events = await db
    .select({
      type: purchaseEvents.type,
      reason: purchaseEvents.reason,
      createdAt: purchaseEvents.createdAt,
    })
    .from(purchaseEvents)
    .where(eq(purchaseEvents.orderId, id))
    .orderBy(purchaseEvents.createdAt, purchaseEvents.id)
  return events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))
}
