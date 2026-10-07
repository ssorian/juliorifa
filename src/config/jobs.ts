import '@tanstack/react-start/server-only'
import { DomainError } from '../modules/purchases/domain'

export function requireJobsEnabled() {
  if (process.env.JOBS_ENABLED !== 'true')
    throw new DomainError('JOBS_NOT_ENABLED')
}
