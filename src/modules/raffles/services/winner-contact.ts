import '@tanstack/react-start/server-only'
import { eq } from 'drizzle-orm'
import type { DrawDatabase } from './draw-repository'
import { purchases } from '../../purchases/db/schema'
import { user } from '../../auth/db/schema'
import { winnerContact } from '../../auth/lib/phone'

/** Caller must enforce admin authorization before querying this projection. */
export async function adminWinnerContact(
  database: DrawDatabase,
  orderId: string,
) {
  const rows = await database
    .select({ name: user.name, phone: user.phone })
    .from(purchases)
    .innerJoin(user, eq(purchases.userId, user.id))
    .where(eq(purchases.id, orderId))
    .limit(1)
  const record = rows.at(0)
  return record ? winnerContact(record.name, record.phone) : null
}
