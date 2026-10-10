import { DomainError } from '../../purchases/domain'

export function raffleLifecycle(status: string, deadline: Date, now: Date) {
  return {
    salesOpen: status === 'active' && now < deadline,
    completed: ['active', 'closed', 'drawn'].includes(status) && now >= deadline,
  }
}

export type ArchiveEvidence = { drawAt: Date; paid: boolean; pending: boolean; occupied: boolean; hasPurchases?: boolean; hasOccupancy?: boolean }

export function assertArchivable(status: string, deadline: Date, now: Date, hasResult: boolean, empty?: ArchiveEvidence) {
  if (status === 'archived') return
  if (!hasResult) {
    if (empty && empty.hasPurchases === false && empty.hasOccupancy === false &&
      ['active', 'closed', 'paused', 'scheduled', 'draft'].includes(status)) return
    if (!empty || !['active', 'closed', 'paused', 'scheduled'].includes(status) ||
      now < deadline || now < empty.drawAt || empty.paid || empty.pending || empty.occupied)
      throw new DomainError('DRAW_REQUIRED_BEFORE_ARCHIVE')
    return
  }
  if (status !== 'archived' && !raffleLifecycle(status, deadline, now).completed)
    throw new DomainError('SALES_NOT_COMPLETED')
}
