import { DomainError } from '../../purchases/domain'

export function assertBusinessAccess(actor: { id: string; role: string; assured: boolean } | null) {
  if (!actor) throw new DomainError('UNAUTHORIZED')
  if (!['client', 'admin'].includes(actor.role)) throw new DomainError('FORBIDDEN')
  if (actor.role === 'admin' && !actor.assured) throw new DomainError('FORBIDDEN')
  return actor
}
