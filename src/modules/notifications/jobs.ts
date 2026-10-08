import '@tanstack/react-start/server-only'
import { db } from '../../db'
import { requireJobsEnabled } from '../../config/jobs'
import { storageConfig } from '../../config/storage'
import { createStorage } from '../../lib/storage/supabase'
import { createRecoveryRepository } from '../../lib/storage/recovery-repository'
import { recoverStorage } from '../../lib/storage/recovery-worker'
import { expireBatch } from '../purchases/expiry-job'
import { createOutboxRepository } from './repository'
import { processOutbox } from './worker'
import { prepareDelivery } from './delivery'
import { jobsInput } from './schemas'

// Internal operator entrypoint, not a publicly callable serverFn.
export async function runJobs(input: unknown) {
  requireJobsEnabled()
  const { kind, batch } = jobsInput.parse(input)
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
  const outbox =
    kind === 'all' || kind === 'outbox'
      ? await processOutbox(
          createOutboxRepository(db),
          (event) =>
            prepareDelivery(db, event, process.env.BETTER_AUTH_URL ?? ''),
          undefined,
          batch,
        )
      : null
  return { expire, storage, outbox }
}
