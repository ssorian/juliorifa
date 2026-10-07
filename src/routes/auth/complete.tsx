import { createFileRoute, redirect } from '@tanstack/react-router'
import { currentUser } from '../../modules/auth/services/session'
import {
  postAuthDestination,
  safeCheckoutId,
} from '../../modules/auth/lib/policy'

export const Route = createFileRoute('/auth/complete')({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: safeCheckoutId(search.checkout),
  }),
  beforeLoad: async ({ search }) => {
    const user = await currentUser()
    if (!user) throw redirect({ href: '/login?error=link' })
    throw redirect({ href: postAuthDestination(user.role, search.checkout) })
  },
})
