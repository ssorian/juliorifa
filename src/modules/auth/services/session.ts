import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '../../../lib/auth'
import { readMfaAccess } from '../lib/admin-mfa'

// Authentication remains available before enrollment. Only business guards deny
// unassured administrators, avoiding login/dashboard/security redirect loops.
export const currentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(), query: { disableCookieCache: true },
  })
  if (!session) return null
  const access = await readMfaAccess(await auth.$context, session.session.token)
  if (!access) return null
  return {
    id: access.id, name: access.name, role: access.role,
    mfaRequired: access.role === 'admin' && !access.assured,
    mfaEnrolled: access.enrolled,
  }
})
