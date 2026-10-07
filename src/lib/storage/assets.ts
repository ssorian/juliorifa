import '@tanstack/react-start/server-only'
import { eq, and } from 'drizzle-orm'
import { db } from '../../db'
import { mediaAssets } from './db'

export async function claimOrphan(id: string) {
  const rows = await db
    .update(mediaAssets)
    .set({ status: 'orphan' })
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.status, 'pending')))
    .returning({ id: mediaAssets.id })
  return rows.length === 1
}
export async function markDeleted(id: string) {
  await db
    .update(mediaAssets)
    .set({ status: 'deleted' })
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.status, 'orphan')))
}
