import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { user, account } from '../db/schema'

export interface PromotionRepository {
  find: (
    email: string,
  ) => Promise<{ id: string; credential: boolean } | undefined>
  promote: (id: string) => Promise<void>
}

// Lazy DB access keeps validation and injected tests independent of real infrastructure.
async function privateRepository(): Promise<PromotionRepository> {
  const { db } = await import('../../../db')
  return {
    async find(email) {
      const records = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1)
      const existing = records.at(0)
      if (!existing) return undefined
      const credentials = await db
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, existing.id),
            eq(account.providerId, 'credential'),
            isNotNull(account.password),
            ne(account.password, ''),
          ),
        )
        .limit(1)
      return { id: existing.id, credential: credentials.length > 0 }
    },
    async promote(id) {
      await db
        .update(user)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(eq(user.id, id))
    },
  }
}

// Private operational service; no user creation, password changes or email verification.
export async function promoteExistingAdmin(
  email: string,
  confirmed: boolean,
  repository?: PromotionRepository,
) {
  if (!confirmed) throw new Error('Operational confirmation required')
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error('Valid email required')
  const target = repository ?? (await privateRepository())
  const existing = await target.find(normalized)
  if (!existing?.credential)
    throw new Error('Existing credential account required')
  await target.promote(existing.id)
}
