import { createAuthClient } from 'better-auth/react'

// EmailAccess owns the single full navigation through the fresh server role gate.
// Otherwise the SDK redirect plugin and location.assign race each other.
export const authClient = createAuthClient({ disableDefaultFetchPlugins: true })
