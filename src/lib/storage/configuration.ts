import { DomainError } from '../../modules/purchases/domain'

export interface StorageConfig {
  url: string
  bucket: string
  secretKey: string
}
export function resolveStorageConfig(
  env: Record<string, string | undefined>,
): StorageConfig {
  const urlValue = env.SUPABASE_URL
  // Explicit legacy server-key alias; never use anon/publishable browser keys.
  const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = env.SUPABASE_STORAGE_BUCKET
  if (!urlValue || !secretKey || !bucket || !/^[a-zA-Z0-9_-]+$/.test(bucket))
    throw new DomainError('STORAGE_NOT_CONFIGURED')
  let url: URL
  try {
    url = new URL(urlValue)
  } catch {
    throw new DomainError('STORAGE_NOT_CONFIGURED')
  }
  if (
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new DomainError('STORAGE_NOT_CONFIGURED')
  return { url: urlValue, bucket, secretKey }
}
