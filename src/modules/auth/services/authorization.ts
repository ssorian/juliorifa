import '@tanstack/react-start/server-only'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { auth } from '../../../lib/auth'
import { db } from '../../../db'
import { user } from '../db/schema'
import { DomainError } from '../../purchases/domain'
import { assertRole } from '../../raffles/lib/backend-policy'

export async function requireUser() {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
    query: { disableCookieCache: true },
  })
  if (!session) throw new DomainError('UNAUTHORIZED')
  const records = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)
  const actor = records.at(0)
  if (!actor || !['client', 'admin'].includes(actor.role))
    throw new DomainError('FORBIDDEN')
  return actor
}
async function requireRole(role: 'client' | 'admin') {
  return assertRole(await requireUser(), role)
}
export const requireClient = () => requireRole('client')
export const requireAdmin = () => requireRole('admin')
