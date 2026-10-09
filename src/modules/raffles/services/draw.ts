import '@tanstack/react-start/server-only'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { requireAdmin } from '../../auth/services/authorization'
import { DomainError } from '../../purchases/domain'
import { raffles, draws } from '../db/schema'
import { isPublic } from '../lib/backend-policy'
import { performDraw, publicDrawDTO } from './draw-repository'
import { adminWinnerContact } from './winner-contact'

export async function draw(id: string) {
  const actor = await requireAdmin()
  return publicDrawDTO(await performDraw(db, id, actor.id))
}
export async function result(id: string, admin = false) {
  if (admin) await requireAdmin()
  const raffleRows = await db
    .select({ status: raffles.status })
    .from(raffles)
    .where(eq(raffles.id, id))
  const raffle = raffleRows.at(0)
  if (!raffle || (!admin && !isPublic(raffle.status)))
    throw new DomainError('NOT_FOUND')
  const rows = await db.select().from(draws).where(eq(draws.raffleId, id)),
    record = rows.at(0)
  if (!record) return null
  return admin
    ? {
        ...publicDrawDTO(record),
        id: record.id,
        randomIndex: record.randomIndex,
        winnerOrderId: record.winnerOrderId,
        actorId: record.actorId,
        source: record.source,
        winnerContact: await adminWinnerContact(db, record.winnerOrderId),
      }
    : publicDrawDTO(record)
}
