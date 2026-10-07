import { DomainError } from '../../modules/purchases/domain'

export interface StorageConfig {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}
export function resolveStorageConfig(
  env: Record<string, string | undefined>,
): StorageConfig {
  const {
    S3_ENDPOINT,
    S3_REGION,
    S3_BUCKET,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
  } = env
  if (
    !S3_ENDPOINT ||
    !S3_REGION ||
    !S3_BUCKET ||
    !S3_ACCESS_KEY_ID ||
    !S3_SECRET_ACCESS_KEY
  )
    throw new DomainError('STORAGE_NOT_CONFIGURED')
  let url: URL
  try {
    url = new URL(S3_ENDPOINT)
  } catch {
    throw new DomainError('STORAGE_NOT_CONFIGURED')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new DomainError('STORAGE_NOT_CONFIGURED')
  return {
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  }
}
