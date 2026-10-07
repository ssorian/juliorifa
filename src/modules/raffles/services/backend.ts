import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, ilike, or } from 'drizzle-orm'
import { db } from '../../../db'
import { requireAdmin } from '../../auth/services/authorization'
import { raffles } from '../db/schema'
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

function dto(r: typeof raffles.$inferSelect, admin = false) {
  const base = {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
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
function validateSale(data: z.infer<typeof raffleInput>) {
  if (data.status === 'active' && Date.parse(data.salesDeadline) <= Date.now())
    throw new DomainError('DEADLINE_PASSED')
}
function fingerprint(data: z.infer<typeof raffleInput>) {
  return JSON.stringify([
    data.title,
    data.description,
    data.startNumber,
    data.ticketCount,
    data.priceCents,
    data.feeBps,
    data.prizeCostCents,
    data.expensesCents,
    new Date(data.salesDeadline).toISOString(),
    new Date(data.drawAt ?? data.salesDeadline).toISOString(),
    data.features.map((f) => [f.title, f.description]),
    data.images.map((i) => [i.key, i.alt]),
  ])
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
  validateSale(data)
  return db.transaction(async (tx) => {
    const current = await lockRaffle(tx, data.id)
    if (current.status === 'drawn' || current.status === 'archived') {
      const prior = {
        title: current.title,
        description: current.description,
        status: data.status,
        startNumber: current.startNumber,
        ticketCount: current.ticketCount,
        priceCents: current.priceCents,
        feeBps: current.feeBps,
        prizeCostCents: current.prizeCostCents,
        expensesCents: current.expensesCents,
        salesDeadline: current.salesDeadline.toISOString(),
        drawAt: (current.drawAt ?? current.salesDeadline).toISOString(),
        features: current.features,
        images: current.images,
      }
      if (
        data.status !== 'archived' ||
        fingerprint(data) !== fingerprint(prior)
      )
        throw new DomainError('DRAWN_IMMUTABLE')
      const [row] = await tx
        .update(raffles)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(raffles.id, data.id))
        .returning()
      return dto(row, true)
    }
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
  return rows.map((row) => dto(row, admin))
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
  return dto(row, admin)
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
