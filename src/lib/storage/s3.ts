import '@tanstack/react-start/server-only'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { DomainError } from '../../modules/purchases/domain'
import type { StorageConfig } from './configuration'

export type AssetKind = 'proof' | 'image'
type Send = (
  command: PutObjectCommand | DeleteObjectCommand,
) => Promise<unknown>
type Sign = (
  client: S3Client,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>
export function assertObjectKey(key: string, kind: AssetKind) {
  const prefix = kind === 'proof' ? 'proofs' : 'images'
  if (
    !new RegExp(
      `^${prefix}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
    ).test(key)
  )
    throw new DomainError('INVALID_ASSET')
}
export function createStorage(
  config: StorageConfig,
  send?: Send,
  sign: Sign = getSignedUrl,
) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    maxAttempts: 3,
    requestHandler: { requestTimeout: 30000, connectionTimeout: 5000 },
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
  const execute = send ?? ((command) => client.send(command))
  return {
    async put(key: string, bytes: Buffer, mime: string) {
      assertObjectKey(key, key.startsWith('proofs/') ? 'proof' : 'image')
      try {
        await execute(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: bytes,
            ContentType: mime,
            ContentLength: bytes.length,
            CacheControl: 'private, no-store',
          }),
        )
      } catch {
        throw new DomainError('STORAGE_UNAVAILABLE')
      }
    },
    async remove(key: string) {
      assertObjectKey(key, key.startsWith('proofs/') ? 'proof' : 'image')
      try {
        await execute(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        )
      } catch {
        throw new DomainError('STORAGE_UNAVAILABLE')
      }
    },
    async url(key: string, kind: AssetKind, mime: string) {
      assertObjectKey(key, kind)
      const extension =
        mime === 'application/pdf'
          ? 'pdf'
          : mime === 'image/jpeg'
            ? 'jpg'
            : mime === 'image/webp'
              ? 'webp'
              : 'png'
      const disposition =
        kind === 'proof'
          ? `attachment; filename="receipt.${extension}"`
          : 'inline'
      try {
        return await sign(
          client,
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
            ResponseContentType: mime,
            ResponseContentDisposition: disposition,
            ResponseCacheControl: 'private, no-store',
          }),
          { expiresIn: 60 },
        )
      } catch {
        throw new DomainError('STORAGE_UNAVAILABLE')
      }
    },
  }
}
export type ObjectStorage = ReturnType<typeof createStorage>
