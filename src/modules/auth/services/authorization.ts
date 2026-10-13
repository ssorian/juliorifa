import '@tanstack/react-start/server-only'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '../../../lib/auth'
import { DomainError } from '../../purchases/domain'
import { assertRole } from '../../raffles/lib/backend-policy'
import { readMfaAccess } from '../lib/admin-mfa'
import { assertBusinessAccess } from '../lib/business-access'

export async function requireUser() {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
    query: { disableCookieCache: true },
  })
  if (!session) throw new DomainError('UNAUTHORIZED')
  // Apply to every business entrypoint: some owner/admin resources call
  // requireUser and branch on role rather than going through requireAdmin.
  const actor = assertBusinessAccess(await readMfaAccess(await auth.$context, session.session.token))
  return { id: actor.id, role: actor.role }
}
async function requireRole(role: 'client' | 'admin') {
  return assertRole(await requireUser(), role)
}
export const requireClient = () => requireRole('client')
export const requireAdmin = () => requireRole('admin')
