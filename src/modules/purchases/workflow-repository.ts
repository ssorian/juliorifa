import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { db } from '../../db'
import { mediaAssets,uploadLeases } from '../../lib/storage/db'
import { raffles } from '../raffles/db/schema'
import { notificationOutbox } from '../notifications/db/schema'
import { purchases, occupancy, orderTickets, purchaseEvents } from './db/schema'
import { DomainError } from './domain'
import type { WorkflowRepository, WorkflowOrder } from './workflow'

export type WorkflowDatabase = Pick<typeof db, 'transaction'>
export function createWorkflowRepository(
  database: WorkflowDatabase,
  context: {
    orderId: string
    raffleId: string
    actorId: string
    now: number
    assetId?: string
    uploadToken?: string
  },
): WorkflowRepository {
  return {
    transaction: (operation) =>
      database.transaction(async (tx) => {
        let locked: WorkflowOrder | null = null
        let lastReason = ''
        let now = new Date(context.now)
        async function audit(type: string, reason?: string) {
          await tx.insert(purchaseEvents).values({
            id: randomUUID(),
            orderId: context.orderId,
            actorId: context.actorId,
            type,
            reason,
            createdAt: now,
          })
        }
        return operation({
          async lock() {
            const raffleRows = await tx
              .select({ id: raffles.id })
              .from(raffles)
              .where(eq(raffles.id, context.raffleId))
              .for('update')
            if (!raffleRows.at(0)) throw new DomainError('NOT_FOUND')
            const rows = await tx
              .select()
              .from(purchases)
              .where(
                and(
                  eq(purchases.id, context.orderId),
                  eq(purchases.raffleId, context.raffleId),
                ),
              )
              .for('update')
            const row = rows.at(0)
            if (!row) throw new DomainError('NOT_FOUND')
            let proofVerified = false
            if (row.proofAssetId) {
              const assets = await tx
                .select()
                .from(mediaAssets)
                .where(eq(mediaAssets.id, row.proofAssetId))
              const asset = assets.at(0)
              proofVerified =
                !!asset &&
                asset.kind === 'proof' &&
                asset.status === 'verified' &&
                !!asset.verifiedAt &&
                asset.purchaseId === row.id &&
                asset.ownerId === row.userId &&
                asset.key === `proofs/${asset.id}` &&
                asset.key === row.proofKey &&
                asset.digest === row.proofDigest &&
                !!row.proofReceivedAt &&
                row.proofReceivedAt < row.expiresAt
            }
            locked = {
              id: row.id,
              userId: row.userId,
              status: row.status,
              expiresAt: row.expiresAt.getTime(),
              proofVerified,
            }
            return locked
          },
          async expire(clock) {
            now = new Date(clock)
            if (!locked) throw new DomainError('NOT_FOUND')
            if (
              locked.status === 'awaiting_proof' &&
              clock >= locked.expiresAt
            ) {
              await tx
                .update(purchases)
                .set({ status: 'expired', updatedAt: now })
                .where(eq(purchases.id, locked.id))
              await tx
                .delete(occupancy)
                .where(
                  and(
                    eq(occupancy.orderId, locked.id),
                    eq(occupancy.state, 'reserved'),
                  ),
                )
              await audit('expired')
              locked.status = 'expired'
            }
          },
          async verifyProof() {
            if(context.uploadToken) {
              const leases=await tx.select().from(uploadLeases).where(and(eq(uploadLeases.kind,'proof'),eq(uploadLeases.targetId,context.orderId),eq(uploadLeases.ownerId,context.actorId),eq(uploadLeases.token,context.uploadToken),gt(uploadLeases.expiresAt,now))).for('update')
              if(!leases.at(0)) throw new DomainError('UPLOAD_LEASE_LOST')
            }
            if (!locked || !context.assetId)
              throw new DomainError('VERIFIED_PROOF_REQUIRED')
            const rows = await tx
              .select()
              .from(mediaAssets)
              .where(eq(mediaAssets.id, context.assetId))
              .for('update')
            const asset = rows.at(0)
            if (
              !asset ||
              asset.kind !== 'proof' ||
              asset.status !== 'pending' ||
              asset.purchaseId !== locked.id ||
              asset.ownerId !== locked.userId ||
              asset.key !== `proofs/${asset.id}`
            )
              throw new DomainError('INVALID_ASSET')
            await tx
              .update(mediaAssets)
              .set({ status: 'verified', verifiedAt: now })
              .where(eq(mediaAssets.id, asset.id))
            await tx
              .update(purchases)
              .set({
                proofAssetId: asset.id,
                proofKey: asset.key,
                proofDigest: asset.digest,
                proofReceivedAt: now,
                updatedAt: now,
              })
              .where(eq(purchases.id, locked.id))
            locked.proofVerified = true
          },
          async transition(status, reason) {
            if (!locked) throw new DomainError('NOT_FOUND')
            const held = await tx
              .select()
              .from(occupancy)
              .where(eq(occupancy.orderId, locked.id))
            const history = await tx
              .select()
              .from(orderTickets)
              .where(eq(orderTickets.orderId, locked.id))
            const expected =
              locked.status === 'awaiting_proof' ? 'reserved' : 'reviewing'
            const heldNumbers = new Set(held.map((t) => t.ticketNumber))
            if (
              !history.length ||
              held.length !== history.length ||
              held.some(
                (t) => t.state !== expected || t.raffleId !== context.raffleId,
              ) ||
              history.some((t) => !heldNumbers.has(t.ticketNumber))
            )
              throw new DomainError('INVENTORY_INVARIANT')
            await tx
              .update(purchases)
              .set({
                status,
                updatedAt: now,
                ...(status === 'paid' || status === 'rejected'
                  ? { reviewedAt: now, reviewerId: context.actorId }
                  : {}),
              })
              .where(eq(purchases.id, locked.id))
            if (status === 'cancelled' || status === 'rejected')
              await tx.delete(occupancy).where(eq(occupancy.orderId, locked.id))
            else
              await tx
                .update(occupancy)
                .set({ state: status === 'paid' ? 'sold' : 'reviewing' })
                .where(eq(occupancy.orderId, locked.id))
            await audit(status === 'paid' ? 'approved' : status, reason)
            locked.status = status
            lastReason = reason
          },
          async notify(event) {
            if (!locked) throw new DomainError('NOT_FOUND')
            await tx
              .insert(notificationOutbox)
              .values({
                id: randomUUID(),
                event,
                key: locked.id,
                payload: {
                  orderId: locked.id,
                  userId: locked.userId,
                  reason: lastReason,
                },
                availableAt: now,
                createdAt: now,
              })
              .onConflictDoNothing({
                target: [notificationOutbox.event, notificationOutbox.key],
              })
          },
        })
      }),
  }
}
