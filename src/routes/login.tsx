import { createFileRoute } from '@tanstack/react-router'
import '../modules/auth/auth.css'
import { EmailAccess } from '../modules/auth/components/EmailAccess'
import { safeCheckoutId } from '../modules/auth/lib/policy'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: safeCheckoutId(search.checkout),
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: function Login() {
    return <EmailAccess {...Route.useSearch()} />
  },
})
