import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import type { auth } from './auth'

// EmailAccess owns the single full navigation through the fresh server role gate.
// Otherwise the SDK redirect plugin and location.assign race each other.
export const authClient = createAuthClient({
  disableDefaultFetchPlugins: true,
  plugins: [inferAdditionalFields<typeof auth>(), twoFactorClient()],
})
