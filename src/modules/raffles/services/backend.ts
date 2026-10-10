import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, ilike, or, sql } from 'drizzle-orm'
import { db } from '../../../db'
import { requireAdmin } from '../../auth/services/authorization'
import { raffles } from '../db/schema'
import { raffleLifecycle, assertArchivable } from '../lib/raffle-lifecycle'
import { occupancy, purchases } from '../../purchases/db/schema'
import { DomainError, validateTickets } from '../../purchases/domain'
import {
  publicStates,
  isPublic,
  assertBlockable,
  assertNumbering,
} from '../lib/backend-policy'
import { expireReservations, lockRaffle } from '../../purchases/repository'
import { mediaAssets } from '../../../lib/storage/db'
import { assertImageAttachment } from './media-policy'
import type { z } from 'zod'
import type {
  raffleInput,
  updateInput,
  adminListInput,
} from '../schemas/backend'

// One bounded-page query; EXISTS uses purchase/occupancy indexes, not per-row requests.
async function archiveEvidence(reader: Pick<typeof db, 'select'>, ids: string[], now: Date) {
  if (!ids.length) return []
  return reader.select({
    id: raffles.id,
    // Constant qualified SQL avoids Drizzle's single-table SELECT column dequalification.
    // All runtime values remain bound parameters; aliases make nested correlation explicit.
    hasPurchases: sql<boolean>`exists(select 1 from purchases as ap where ap.raffle_id = raffles.id)`,
    hasOccupancy: sql<boolean>`exists(select 1 from ticket_occupancy as ao where ao.raffle_id = raffles.id)`,
    hasResult: sql<boolean>`exists(select 1 from raffle_draws as ad where ad.raffle_id = raffles.id)`,
    paid: sql<boolean>`exists(select 1 from purchases as ap where ap.raffle_id = raffles.id and ap.status = 'paid')`,
    pending: sql<boolean>`exists(select 1 from purchases as ap where ap.raffle_id = raffles.id and (ap.status = 'reviewing' or (ap.status = 'awaiting_proof' and ap.expires_at > ${now})))`,
    occupied: sql<boolean>`exists(select 1 from ticket_occupancy as ao where ao.raffle_id = raffles.id and (ao.state in ('sold','reviewing') or (ao.state = 'reserved' and not exists(select 1 from purchases as ap where ap.id = ao.order_id and ap.raffle_id = raffles.id and ap.status = 'awaiting_proof' and ap.expires_at <= ${now}))))`,
  }).from(raffles).where(inArray(raffles.id, ids))
}
type Evidence = Awaited<ReturnType<typeof archiveEvidence>>[number]
function dto(r: typeof raffles.$inferSelect, admin = false, evidence?: Evidence, now = new Date()) {
  const lifecycle = raffleLifecycle(r.status, r.salesDeadline, now)
  const base = {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    ...lifecycle,
    canArchive: eligibleArchive(r, evidence, now),
    ...(admin ? { archiveWithoutDraw: !!evidence && !evidence.hasResult && eligibleArchive(r, evidence, now) } : {}),
    ticketCount: r.ticketCount,
    startNumber: r.startNumber,
    priceCents: r.priceCents,
    features: r.features,
    images: r.images
      .filter((i) => /^images\/[0-9a-f-]{36}$/.test(i.key))
      .map((i) => ({ ...i, mediaUrl: `/api/media/images/${i.key.slice(7)}` })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    salesDeadline: r.salesDeadline.toISOString(),
    drawAt: (r.drawAt ?? r.salesDeadline).toISOString(),
  }
  return {
    ...base,
    ...(admin
      ? {
          feeBps: r.feeBps,
          prizeCostCents: r.prizeCostCents,
          expensesCents: r.expensesCents,
        }
      : {}),
  }
}
function eligibleArchive(r: typeof raffles.$inferSelect, evidence: Evidence | undefined, now: Date) {
  if (!evidence || r.status === 'archived') return false
  try {
    assertArchivable(r.status, r.salesDeadline, now, evidence.hasResult, { ...evidence, drawAt: r.drawAt ?? r.salesDeadline })
    return true
  } catch { return false }
}
function validateSale(data: z.infer<typeof raffleInput>) {
  if (data.status === 'active' && Date.parse(data.salesDeadline) <= Date.now())
    throw new DomainError('DEADLINE_PASSED')
}
export async function create(data: z.infer<typeof raffleInput>) {
  await requireAdmin()
  validateSale(data)
  if (data.images.length) throw new DomainError('IMAGE_UPLOAD_AFTER_CREATE')
  const [row] = await db
    .insert(raffles)
    .values({
      ...data,
      id: randomUUID(),
      salesDeadline: new Date(data.salesDeadline),
      drawAt: new Date(data.drawAt ?? data.salesDeadline),
    })
    .returning()
  return dto(row, true)
}
export async function update(data: z.infer<typeof updateInput>) {
  const actor = await requireAdmin()
  // Archival is a narrow status-only operation, including through update.
  if (data.status === 'archived') return archive(data.id)
  validateSale(data)
  return db.transaction(async (tx) => {
    const current = await lockRaffle(tx, data.id)
    if (current.status === 'drawn' || current.status === 'archived')
      throw new DomainError('DRAWN_IMMUTABLE')
    if (new Set(data.images.map((i) => i.key)).size !== data.images.length)
      throw new DomainError('INVALID_IMAGE_ASSET')
    for (const image of data.images) {
      const assets = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.key, image.key))
      assertImageAttachment(assets.at(0), data.id, actor.id)
    }
    const history = await tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.raffleId, data.id))
      .limit(1)
    const occupied = await tx
      .select({ number: occupancy.ticketNumber })
      .from(occupancy)
      .where(eq(occupancy.raffleId, data.id))
    assertNumbering(
      current.ticketCount,
      data.ticketCount,
      history.length > 0,
      occupied.map((t) => t.number),
      current.startNumber,
      data.startNumber,
    )
    const [row] = await tx
      .update(raffles)
      .set({
        ...data,
        salesDeadline: new Date(data.salesDeadline),
        drawAt: new Date(data.drawAt ?? data.salesDeadline),
        updatedAt: new Date(),
      })
      .where(eq(raffles.id, data.id))
      .returning()
    return dto(row, true)
  })
}
// Expiration commits even when archival is refused; never cancel reviewing.
export async function archive(id: string) {
  await requireAdmin()
  const outcome = await db.transaction(async (tx) => {
    const current = await lockRaffle(tx, id)
    const now = new Date()
    if (current.status === 'archived') return { row: dto(current, true) }
    await expireReservations(tx, id, now)
    const [evidence] = await archiveEvidence(tx, [id], now)
    try {
      assertArchivable(current.status, current.salesDeadline, now, evidence.hasResult, { ...evidence, drawAt: current.drawAt ?? current.salesDeadline })
    } catch (error) {
      if (error instanceof DomainError) return { error }
      throw error
    }
    const [row] = await tx.update(raffles).set({ status: 'archived', updatedAt: now }).where(eq(raffles.id, id)).returning()
    return { row: dto(row, true) }
  })
  if (outcome.error) throw outcome.error
  return outcome.row!

}

export async function list(
  offset: number,
  limit: number,
  admin = false,
  filters?: z.infer<typeof adminListInput>,
) {
  if (admin) await requireAdmin()
  const rows = await db
    .select()
    .from(raffles)
    .where(
      admin
        ? and(
            filters?.status && filters.status !== 'all'
              ? inArray(raffles.status, [
                  filters.status as typeof raffles.$inferSelect.status,
                ])
              : undefined,
            filters?.search
              ? or(
                  ilike(raffles.title, `%${filters.search}%`),
                  ilike(raffles.description, `%${filters.search}%`),
                )
              : undefined,
          )
        : inArray(raffles.status, [...publicStates]),
    )
    .orderBy(raffles.createdAt, raffles.id)
    .offset(offset)
    .limit(limit)
  const now = new Date()
  const evidence = admin ? await archiveEvidence(db, rows.map((r) => r.id), now) : []
  const byId = new Map(evidence.map((e) => [e.id, e]))
  return rows.map((row) => dto(row, admin, byId.get(row.id), now))
}
export async function detail(id: string, admin = false) {
  if (admin) await requireAdmin()
  const rows = await db
    .select()
    .from(raffles)
    .where(
      admin
        ? eq(raffles.id, id)
        : and(eq(raffles.id, id), inArray(raffles.status, [...publicStates])),
    )
  const row = rows.at(0)
  if (!row) throw new DomainError('NOT_FOUND')
  const now = new Date()
  const evidence = admin ? (await archiveEvidence(db, [id], now))[0] : undefined
  return dto(row, admin, evidence, now)
}
export async function inventory(
  id: string,
  from: number,
  limit: number,
  admin = false,
) {
  if (admin) await requireAdmin()
  return db.transaction(async (tx) => {
    const raffle = await lockRaffle(tx, id)
    if (!admin && !isPublic(raffle.status)) throw new DomainError('NOT_FOUND')
    if (
      from < raffle.startNumber ||
      from >= raffle.startNumber + raffle.ticketCount
    )
      throw new DomainError('INVALID_RANGE')
    const now = new Date()
    await expireReservations(tx, id, now)
    const rows = await tx
      .select({ number: occupancy.ticketNumber, state: occupancy.state })
      .from(occupancy)
      .where(eq(occupancy.raffleId, id))
    const states = new Map(rows.map((r) => [r.number, r.state]))
    return {
      id,
      salesOpen: raffle.status === 'active' && now < raffle.salesDeadline,
      startNumber: raffle.startNumber,
      ticketCount: raffle.ticketCount,
      tickets: Array.from(
        {
          length: Math.min(
            limit,
            raffle.startNumber + raffle.ticketCount - from,
          ),
        },
        (_, i) => ({
          number: from + i,
          state: states.get(from + i) ?? 'available',
        }),
      ),
    }
  })
}
export async function block(
  raffleId: string,
  numbers: number[],
  blocked: boolean,
) {
  await requireAdmin()
  return db.transaction(async (tx) => {
    const raffle = await lockRaffle(tx, raffleId)
    if (['drawn', 'archived'].includes(raffle.status))
      throw new DomainError('RAFFLE_IMMUTABLE')
    const tickets = validateTickets(
      numbers,
      raffle.ticketCount,
      raffle.startNumber,
    )
    await expireReservations(tx, raffleId, new Date())
    const existing = await tx
      .select()
      .from(occupancy)
      .where(
        and(
          eq(occupancy.raffleId, raffleId),
          inArray(occupancy.ticketNumber, tickets),
        ),
      )
    assertBlockable(existing.map((r) => r.state))
    if (blocked) {
      const present = new Set(existing.map((r) => r.ticketNumber)),
        added = tickets.filter((n) => !present.has(n))
      if (added.length)
        await tx.insert(occupancy).values(
          added.map((ticketNumber) => ({
            raffleId,
            ticketNumber,
            state: 'blocked' as const,
          })),
        )
    } else
      await tx
        .delete(occupancy)
        .where(
          and(
            eq(occupancy.raffleId, raffleId),
            inArray(occupancy.ticketNumber, tickets),
            eq(occupancy.state, 'blocked'),
          ),
        )
    return { ok: true }
  })
}
export async function csv(id: string) {
  await requireAdmin()
  return db.transaction(async (tx) => {
    const raffle = await lockRaffle(tx, id)
    await expireReservations(tx, id, new Date())
    const rows = await tx
      .select({ number: occupancy.ticketNumber, state: occupancy.state })
      .from(occupancy)
      .where(eq(occupancy.raffleId, id))
    const states = new Map(rows.map((r) => [r.number, r.state]))
    return (
      'ticket_number,state\n' +
      Array.from(
        { length: raffle.ticketCount },
        (_, i) =>
          `${i + raffle.startNumber},${states.get(i + raffle.startNumber) ?? 'available'}`,
      ).join('\n')
    )
  })
}
