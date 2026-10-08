import '@tanstack/react-start/server-only'
import { createClient } from '@supabase/supabase-js'
import { DomainError } from '../../modules/purchases/domain'
import type { StorageConfig } from './configuration'

export type AssetKind = 'proof' | 'image'
const MAX_DOWNLOAD = 10 * 1024 * 1024
export function assertObjectKey(key: string, kind: AssetKind) {
  const prefix = kind === 'proof' ? 'proofs' : 'images'
  if (
    !new RegExp(
      `^${prefix}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
    ).test(key)
  )
    throw new DomainError('INVALID_ASSET')
}
// Injected only at the SDK transport boundary. Limit before SDK blob allocation.
export function boundedStorageFetch(
  origin: string,
  transport: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== new URL(origin).origin || url.username || url.password)
      throw new DomainError('STORAGE_UNAVAILABLE')
    const controller = new AbortController()
    const caller =
      init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const signal = caller
      ? AbortSignal.any([caller, controller.signal])
      : controller.signal
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await transport(input, {
        ...init,
        signal,
        redirect: 'error',
      })
      const length = response.headers.get('content-length')
      if (length && (!/^\d+$/.test(length) || Number(length) > MAX_DOWNLOAD)) {
        controller.abort()
        await response.body?.cancel()
        throw new Error('Response too large')
      }
      if (!response.body) {
        clearTimeout(timer)
        return response
      }
      const reader = response.body.getReader()
      let total = 0
      const abort = () => {
        void reader.cancel().catch(() => {})
        clearTimeout(timer)
      }
      signal.addEventListener('abort', abort, { once: true })
      const finish = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
      }
      const body = new ReadableStream<Uint8Array>({
        async pull(stream) {
          try {
            signal.throwIfAborted()
            const chunk = await reader.read()
            signal.throwIfAborted()
            if (chunk.done) {
              finish()
              stream.close()
              return
            }
            total += chunk.value.byteLength
            if (total > MAX_DOWNLOAD) {
              controller.abort()
              await reader.cancel()
              throw new Error('Response too large')
            }
            stream.enqueue(chunk.value)
          } catch {
            finish()
            stream.error(new DomainError('STORAGE_UNAVAILABLE'))
          }
        },
        async cancel() {
          finish()
          controller.abort()
          await reader.cancel()
        },
      })
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch {
      clearTimeout(timer)
      controller.abort()
      throw new DomainError('STORAGE_UNAVAILABLE')
    }
  }
}
interface StorageBucket {
  upload: (
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl: string; upsert: boolean },
  ) => PromiseLike<{ error: unknown }>
  remove: (keys: string[]) => PromiseLike<{ error: unknown }>
  createSignedUrl: (
    key: string,
    ttl: number,
  ) => PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>
  download: (key: string) => PromiseLike<{ data: Blob | null; error: unknown }>
}
export function createStorage(config: StorageConfig, bucket?: StorageBucket) {
  const objects =
    bucket ??
    createClient(config.url, config.secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: boundedStorageFetch(config.url) },
    }).storage.from(config.bucket)
  return {
    async put(key: string, bytes: Buffer, mime: string) {
      assertObjectKey(key, key.startsWith('proofs/') ? 'proof' : 'image')
      try {
        const result = await objects.upload(key, bytes, {
          contentType: mime,
          cacheControl: '0',
          upsert: false,
        })
        if (result.error) throw result.error
      } catch {
        throw new DomainError('STORAGE_UNAVAILABLE')
      }
    },
    async remove(key: string) {
      assertObjectKey(key, key.startsWith('proofs/') ? 'proof' : 'image')
      try {
        const result = await objects.remove([key])
        if (result.error) throw result.error
      } catch {
        throw new DomainError('STORAGE_UNAVAILABLE')
      }
    },
    async url(key: string, kind: AssetKind, _mime: string) {
      assertObjectKey(key, kind)
      if (kind !== 'image') throw new DomainError('INVALID_ASSET')
      try {
        const result = await objects.createSignedUrl(key, 60)
        if (result.error || !result.data?.signedUrl)
          throw new Error('Missing URL')
        return result.data.signedUrl
      } catch {
        throw new DomainError('STORAGE_UNAVAILABLE')
      }
    },
    async download(key: string, mime: string, size: number) {
      assertObjectKey(key, 'proof')
      if (
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_DOWNLOAD ||
        !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(
          mime,
        )
      )
        throw new DomainError('INVALID_ASSET')
      try {
        const result = await objects.download(key)
        if (
          result.error ||
          !result.data ||
          result.data.size !== size ||
          result.data.type !== mime
        )
          throw new Error('Invalid object')
        return { bytes: Buffer.from(await result.data.arrayBuffer()), mime }
      } catch {
        throw new DomainError('STORAGE_UNAVAILABLE')
      }
    },
  }
}
export type ObjectStorage = ReturnType<typeof createStorage>
