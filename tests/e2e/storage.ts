import { state, signature } from './state'
import type { StorageConfig } from '../../src/lib/storage/configuration'

export type AssetKind = 'proof' | 'image'
export function assertObjectKey(key: string, kind: AssetKind) {
  if (
    !new RegExp(
      `^${kind === 'proof' ? 'proofs' : 'images'}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
    ).test(key)
  )
    throw new Error('INVALID_ASSET')
}
export function createStorage(_config: StorageConfig) {
  return {
    async put(key: string, bytes: Buffer, mime: string) {
      assertObjectKey(key, key.startsWith('proofs/') ? 'proof' : 'image')
      state.objects.set(key, { bytes: Buffer.from(bytes), mime })
    },
    async remove(key: string) {
      assertObjectKey(key, key.startsWith('proofs/') ? 'proof' : 'image')
      state.objects.delete(key)
    },
    async url(key: string, kind: AssetKind, mime: string) {
      assertObjectKey(key, kind)
      const query = new URLSearchParams({
        key,
        kind,
        mime,
        expires: String(Date.now() + 60_000),
      }).toString()
      return `http://127.0.0.1:3212/__fixture/object?${query}&signature=${signature(query)}`
    },
  }
}
export type ObjectStorage = ReturnType<typeof createStorage>
