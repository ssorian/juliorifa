import '@tanstack/react-start/server-only'
import { createHash, randomUUID } from 'node:crypto'
import { and, eq, ilike, or, sql, desc, inArray } from 'drizzle-orm'
import { user } from '../auth/db/schema'
import { winnerContact } from '../auth/lib/phone'
import { mediaAssets } from '../../lib/storage/db'
import { db } from '../../db'
import {
  requireAdmin,
  requireClient,
  requireUser,
} from '../auth/services/authorization'
import {
  purchases,
  orderTickets,
  occupancy,
  purchaseEvents,
  paymentSettings,
} from './db/schema'
import {
  assertSamePayload,
  assertSalesOpen,
  DomainError,
  quote,
  validateTickets,
} from './domain'
import {
  expireReservations,
  lockRaffle,
  purchaseDTO,
  findOwnReservationByKey,
} from './repository'
import type { z } from 'zod'
import type { reserveInput } from './schemas'
import type { adminListInput } from '../raffles/schemas/backend'
import {
  cancelWithRepository,
  adminCancelWithRepository,
  snapshotInstructions,
} from './workflow'
import { createWorkflowRepository } from './workflow-repository'
import { resolvePaymentInstructions } from './payment-config'
import { raffles } from '../raffles/db/schema'
import { listOwnProducts } from './lib/purchase-products'
import { paymentMethods } from '../settings/db/schema'
import { snapshotMethods } from '../settings/domain'

export async function lookupOwnReservationByKey(idempotencyKey: string) {
  const actor = await requireUser()
  return findOwnReservationByKey(db, actor.id, idempotencyKey)
}

export async function reserve(data: z.infer<typeof reserveInput>) {
  const actor = await requireClient()
  return db.transaction(async (tx) => {
    // User row serializes idempotency across different raffles without lock inversion.
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, actor.id))
      .for('update')
    const raffle = await lockRaffle(tx, data.raffleId)
    const tickets = validateTickets(
      data.tickets,
      raffle.ticketCount,
      raffle.startNumber,
    )
    const digest = createHash('sha256')
      .update(JSON.stringify({ raffleId: raffle.id, tickets }))
      .digest('hex')
    const existingRows = await tx
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.userId, actor.id),
          eq(purchases.idempotencyKey, data.idempotencyKey),
        ),
      )
    const existing = existingRows.at(0)
    if (existing) assertSamePayload(existing.payloadDigest, digest)
    const now = new Date()
    await expireReservations(tx, raffle.id, now)
    if (existing) {
      const [fresh] = await tx
        .select()
        .from(purchases)
        .where(eq(purchases.id, existing.id))
      return purchaseDTO(fresh, tickets)
    }
    assertSalesOpen(
      raffle.status,
      raffle.salesDeadline.getTime(),
      now.getTime(),
    )
    const occupied = await tx
      .select({ number: occupancy.ticketNumber })
      .from(occupancy)
      .where(eq(occupancy.raffleId, raffle.id))
    const unavailable = new Set(occupied.map((t) => t.number))
    if (tickets.some((t) => unavailable.has(t)))
      throw new DomainError('TICKET_UNAVAILABLE')
    const settingsRows = await tx
      .select({
        bank: paymentSettings.bank,
        beneficiary: paymentSettings.beneficiary,
        account: paymentSettings.account,
        instructions: paymentSettings.instructions,
      })
      .from(paymentSettings)
      .where(eq(paymentSettings.id, 1))
    const paymentMethodsSnapshot = snapshotMethods(
      await tx.select().from(paymentMethods).orderBy(paymentMethods.position),
    )
    const paymentSnapshot = snapshotInstructions(
      resolvePaymentInstructions(settingsRows.at(0) ?? null, process.env, paymentMethodsSnapshot === null),
    )
    const id = randomUUID()
    const [order] = await tx
      .insert(purchases)
      .values({
        id,
        raffleId: raffle.id,
        userId: actor.id,
        paymentSnapshot,
        paymentMethodsSnapshot,
        idempotencyKey: data.idempotencyKey,
        payloadDigest: digest,
        status: 'awaiting_proof',
        priceCents: raffle.priceCents,
        feeBps: raffle.feeBps,
        ...quote(raffle.priceCents, tickets.length, raffle.feeBps),
        expiresAt: new Date(now.getTime() + 86400000),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    await tx
      .insert(orderTickets)
      .values(tickets.map((ticketNumber) => ({ orderId: id, ticketNumber })))
    await tx.insert(occupancy).values(
      tickets.map((ticketNumber) => ({
        raffleId: raffle.id,
        ticketNumber,
        orderId: id,
        state: 'reserved' as const,
      })),
    )
    await tx.insert(purchaseEvents).values({
      id: randomUUID(),
      orderId: id,
      type: 'reserved',
      actorId: actor.id,
      createdAt: now,
    })
    return purchaseDTO(order, tickets)
  })
}
async function authorizedOrder(id: string, admin: boolean) {
  const actor = admin ? await requireAdmin() : await requireUser()
  const rows = await db
    .select()
    .from(purchases)
    .where(
      admin
        ? eq(purchases.id, id)
        : and(eq(purchases.id, id), eq(purchases.userId, actor.id)),
    )
  const order = rows.at(0)
  if (!order) throw new DomainError('NOT_FOUND')
  return { actor, order }
}
export async function detail(id: string, admin = false) {
  const { order } = await authorizedOrder(id, admin)
  return db.transaction(async (tx) => {
    await lockRaffle(tx, order.raffleId)
    await expireReservations(tx, order.raffleId, new Date())
    const [fresh] = await tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, id))
    const tickets = await tx
      .select()
      .from(orderTickets)
      .where(eq(orderTickets.orderId, id))
      .orderBy(orderTickets.ticketNumber)
    const result = purchaseDTO(
      fresh,
      tickets.map((t) => t.ticketNumber),
    )
    if (!admin) return result
    const raffle = (
      await tx
        .select({ title: raffles.title })
        .from(raffles)
        .where(eq(raffles.id, fresh.raffleId))
    ).at(0)
    const customers = await tx
      .select({ name: user.name, email: user.email, phone: user.phone })
      .from(user)
      .where(eq(user.id, fresh.userId))
    const customer = customers.at(0)
    const assets = fresh.proofAssetId
      ? await tx
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.id, fresh.proofAssetId))
      : []
    const asset = assets.at(0)
    const contact = customer
      ? winnerContact(customer.name, customer.phone)
      : null
    return {
      ...result,
      customer: customer
        ? {
            name: customer.name,
            email: customer.email,
            phone: contact?.phone ?? null,
            whatsapp: contact?.whatsapp ?? null,
          }
        : undefined,
      raffleTitle: raffle?.title ?? 'Rifa no disponible',
      proofMime: asset?.mime ?? null,
      proofVerified:
        !!asset &&
        asset.kind === 'proof' &&
        asset.status === 'verified' &&
        !!asset.verifiedAt &&
        asset.purchaseId === fresh.id &&
        asset.ownerId === fresh.userId &&
        asset.key === `proofs/${asset.id}` &&
        asset.key === fresh.proofKey &&
        asset.digest === fresh.proofDigest &&
        !!fresh.proofReceivedAt &&
        fresh.proofReceivedAt < fresh.expiresAt,
    }
  })
}
export async function cancel(id: string) {
  const { actor, order } = await authorizedOrder(id, false)
  const now = Date.now()
  const result = await cancelWithRepository(
    createWorkflowRepository(db, {
      orderId: id,
      raffleId: order.raffleId,
      actorId: actor.id,
      now,
    }),
    actor.id,
    () => Date.now(),
  )
  return { id, ...result }
}
export async function adminCancel(id: string, reason: string) {
  const { actor, order } = await authorizedOrder(id, true)
  const result = await adminCancelWithRepository(
    createWorkflowRepository(db, {
      orderId: id,
      raffleId: order.raffleId,
      actorId: actor.id,
      now: Date.now(),
    }),
    actor.role,
    reason,
    () => Date.now(),
  )
  return { id, ...result }
}
export async function list(
  offset: number,
  limit: number,
  admin = false,
  filters?: z.infer<typeof adminListInput>,
) {
  const actor = admin ? await requireAdmin() : await requireUser()
  if (!admin) return db.transaction(async tx => {
    const page = await listOwnProducts(tx, actor.id, offset, limit)
    if (!page.length) return page
    const ids = [...new Set(page.map(order => order.raffleId))].sort()
    // Preserve the existing list's expiry side effect; lock all raffles before orders.
    await tx.select({ id: raffles.id }).from(raffles)
      .where(inArray(raffles.id, ids)).orderBy(raffles.id).for('update')
    const expired = await expireReservations(tx, ids, new Date())
    return expired ? listOwnProducts(tx, actor.id, offset, limit) : page
  })
  const rows = await db
    .select({ id: purchases.id })
    .from(purchases)
    .leftJoin(user, eq(user.id, purchases.userId))
    .where(
      admin
        ? and(
            filters?.status && filters.status !== 'all'
              ? eq(
                  purchases.status,
                  filters.status as typeof purchases.$inferSelect.status,
                )
              : undefined,
            filters?.raffleId
              ? eq(purchases.raffleId, filters.raffleId)
              : undefined,
            filters?.search
              ? or(
                  ilike(user.name, `%${filters.search}%`),
                  ilike(user.email, `%${filters.search}%`),
                  ilike(sql`${purchases.id}::text`, `%${filters.search}%`),
                )
              : undefined,
          )
        : eq(purchases.userId, actor.id),
    )
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .offset(offset)
    .limit(limit)
  return Promise.all(rows.map((row) => detail(row.id, admin)))
}
