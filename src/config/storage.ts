import '@tanstack/react-start/server-only'
import { resolveStorageConfig } from '../lib/storage/configuration'

// Read lazily: absent Supabase configuration must fail usage, not builds.
export function storageConfig() {
  return resolveStorageConfig(process.env)
}
