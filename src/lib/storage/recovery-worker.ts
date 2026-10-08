import '@tanstack/react-start/server-only'
import { DomainError } from '../../modules/purchases/domain'
import type { ObjectStorage } from './supabase'
import type { RecoveryRepository } from './recovery-repository'

export async function recoverStorage(
  repo: RecoveryRepository,
  storage: () => Pick<ObjectStorage, 'remove'>,
  batch = 10,
  clock = () => Date.now(),
) {
  const rows = await repo.claim(batch, clock()),
    result = { claimed: rows.length, deleted: 0, retry: 0, stale: 0 }
  for (let start = 0; start < rows.length; start += 5) {
    await Promise.all(
      rows.slice(start, start + 5).map(async (row) => {
        if (!row.cleanupToken) throw new DomainError('LEASE_INVARIANT')
        try {
          await storage().remove(row.key)
          if (await repo.deleted(row.id, row.cleanupToken)) result.deleted++
          else result.stale++
        } catch (error) {
          const code =
            error instanceof DomainError ? error.code : 'STORAGE_UNAVAILABLE'
          if (
            await repo.failed(
              row.id,
              row.cleanupToken,
              row.cleanupAttempts,
              code,
              clock(),
            )
          )
            result.retry++
          else result.stale++
        }
      }),
    )
  }
  return result
}
