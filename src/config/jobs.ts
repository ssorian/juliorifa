import '@tanstack/react-start/server-only'
import { DomainError } from '../modules/purchases/domain'

import { z } from 'zod'

export function requireJobsEnabled() {
  if (process.env.JOBS_ENABLED !== 'true')
    throw new DomainError('JOBS_NOT_ENABLED')
}

export const jobsInput = z
  .object({
    kind: z.enum(['expire', 'storage', 'all']).default('all'),
    batch: z.int().min(1).max(25).default(10),
  })
  .strict()

// Operator only; never a publicly callable server function.
export async function runJobs(input: unknown) {
  requireJobsEnabled()
  const { kind, batch } = jobsInput.parse(input)
  const { db } = await import('../db')
  const { expireBatch } = await import('../modules/purchases/expiry-job')
  const { storageConfig } = await import('./storage')
  const { createStorage } = await import('../lib/storage/supabase')
  const { createRecoveryRepository } =
    await import('../lib/storage/recovery-repository')
  const { recoverStorage } = await import('../lib/storage/recovery-worker')
  const expire =
    kind === 'all' || kind === 'expire' ? await expireBatch(db, batch) : null
  const storage =
    kind === 'all' || kind === 'storage'
      ? await recoverStorage(
          createRecoveryRepository(db),
          () => createStorage(storageConfig()),
          batch,
        )
      : null
  return { expire, storage }
}
