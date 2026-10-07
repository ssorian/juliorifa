import '@tanstack/react-start/server-only'
import { DomainError } from '../../modules/purchases/domain'
import type { AssetKind } from './s3'

export interface UploadLease {
  kind: AssetKind
  targetId: string
  ownerId: string
  token: string
  expiresAt: Date
}
export interface UploadGuardRepository {
  claim: (
    owner: string,
    target: string,
    kind: AssetKind,
  ) => Promise<UploadLease>
  owns: (lease: UploadLease) => Promise<boolean>
  release: (lease: UploadLease) => Promise<unknown>
}
export async function withUploadGuard<T>(
  repo: UploadGuardRepository,
  owner: string,
  target: string,
  kind: AssetKind,
  operation: (
    lease: UploadLease & { assert: () => Promise<void> },
  ) => Promise<T>,
) {
  const lease = await repo.claim(owner, target, kind)
  try {
    return await operation({
      ...lease,
      async assert() {
        if (!(await repo.owns(lease)))
          throw new DomainError('UPLOAD_LEASE_LOST')
      },
    })
  } finally {
    try {
      await repo.release(lease)
    } catch {
      /* TTL recovers failed release; never clear a newer token. */
    }
  }
}
