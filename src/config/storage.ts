import '@tanstack/react-start/server-only'
import { resolveStorageConfig } from '../lib/storage/configuration'

// Read lazily: absent S3 configuration must fail usage, not builds. No AWS fallbacks.
export function storageConfig() {
  return resolveStorageConfig(process.env)
}
