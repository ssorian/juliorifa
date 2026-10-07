import { createFileRoute } from '@tanstack/react-router'
import { EmailAccess } from '../modules/auth/components/EmailAccess'
import { safeCheckoutId } from '../modules/auth/lib/policy'

export const Route = createFileRoute('/signin')({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: safeCheckoutId(search.checkout),
  }),
  component: function Signup() {
    return <EmailAccess signup {...Route.useSearch()} />
  },
})
