import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { user } from '../db/schema'

// Operational service: never exported by a serverFn or public endpoint.
export async function promoteExistingAdmin(email: string, confirmed: boolean) {
  if (!confirmed) throw new Error('Operational confirmation required')
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error('Valid email required')
  const records = await db
    .select({ id: user.id, verified: user.emailVerified })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1)
  const existing = records.at(0)
  if (!existing?.verified) throw new Error('Existing verified account required')
  await db
    .update(user)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(user.id, existing.id))
}
