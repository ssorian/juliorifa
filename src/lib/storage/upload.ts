import '@tanstack/react-start/server-only'
import { DomainError } from '../../modules/purchases/domain'
import type { ObjectStorage } from './supabase'

export interface UploadLifecycle {
  assertLease?: () => Promise<void>
  persistPending: () => Promise<void>
  finalize: () => Promise<boolean>
  // Must atomically claim only a still-pending asset. Never delete a committed verified proof.
  claimOrphan: () => Promise<boolean>
  markDeleted: () => Promise<void>
}
export async function uploadVerified(
  storage: ObjectStorage,
  key: string,
  bytes: Buffer,
  mime: string,
  lifecycle: UploadLifecycle,
) {
  await lifecycle.persistPending()
  try {
    await lifecycle.assertLease?.()
    await storage.put(key, bytes, mime)
    await lifecycle.assertLease?.()
    if (!(await lifecycle.finalize()))
      throw new DomainError('RESERVATION_EXPIRED')
  } catch (error) {
    try {
      if (await lifecycle.claimOrphan()) {
        await storage.remove(key)
        await lifecycle.markDeleted()
      }
    } catch {
      /* Durable pending/orphan record remains for recovery; never fake success. */
    }
    throw error
  }
}
