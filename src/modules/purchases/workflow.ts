import { DomainError } from './domain'
import type { PurchaseStatus } from './domain'
import type { PaymentInstructions } from './types'

export interface WorkflowOrder {
  id: string
  userId: string
  status: PurchaseStatus
  expiresAt: number
  proofVerified: boolean
}
export interface WorkflowTransaction {
  lock: () => Promise<WorkflowOrder>
  expire: (now: number) => Promise<void>
  transition: (status: PurchaseStatus, reason: string) => Promise<void>
  verifyProof: () => Promise<void>
}
export interface WorkflowRepository {
  transaction: <T>(
    operation: (tx: WorkflowTransaction) => Promise<T>,
  ) => Promise<T>
}
type Clock = number | (() => number)
const time = (clock: Clock) => (typeof clock === 'function' ? clock() : clock)
export function snapshotInstructions(
  settings: PaymentInstructions | null,
): PaymentInstructions | null {
  if (!settings || Object.values(settings).some((v) => !v.trim())) return null
  return { ...settings }
}
export function cancelWithRepository(
  repo: WorkflowRepository,
  owner: string,
  clock: Clock,
) {
  return repo.transaction(async (tx) => {
    const order = await tx.lock()
    if (order.userId !== owner) throw new DomainError('NOT_FOUND')
    await tx.expire(time(clock))
    // Returning, not throwing, preserves expiry and occupancy release at commit.
    if (order.status === 'expired') return { status: 'expired' as const }
    if (order.status === 'cancelled') return { status: 'cancelled' as const }
    if (order.status !== 'awaiting_proof')
      throw new DomainError('CANNOT_CANCEL')
    await tx.transition('cancelled', 'cancelled')
    return { status: 'cancelled' as const }
  })
}
export function adminCancelWithRepository(
  repo: WorkflowRepository,
  role: string,
  reason: string,
  clock: Clock,
) {
  if (role !== 'admin') throw new DomainError('FORBIDDEN')
  if (!reason.trim() || reason.length > 2000)
    throw new DomainError('REASON_REQUIRED')
  return repo.transaction(async (tx) => {
    const order = await tx.lock()
    await tx.expire(time(clock))
    if (order.status === 'expired' || order.status === 'cancelled')
      return { status: order.status }
    if (order.status !== 'awaiting_proof')
      throw new DomainError('CANNOT_CANCEL')
    await tx.transition('cancelled', reason.trim())
    return { status: 'cancelled' as const }
  })
}
export function finalizeWithRepository(
  repo: WorkflowRepository,
  owner: string,
  clock: Clock,
) {
  return repo.transaction(async (tx) => {
    const order = await tx.lock()
    if (order.userId !== owner) throw new DomainError('NOT_FOUND')
    await tx.expire(time(clock))
    if (order.status === 'expired') return { status: 'expired' as const }
    if (order.status !== 'awaiting_proof')
      throw new DomainError('CANNOT_UPLOAD_PROOF')
    await tx.verifyProof()
    await tx.transition('reviewing', 'proof_received')
    return { status: 'reviewing' as const }
  })
}
export function reviewWithRepository(
  repo: WorkflowRepository,
  role: string,
  target: 'paid' | 'rejected',
  reason: string,
  clock: Clock,
) {
  if (role !== 'admin') throw new DomainError('FORBIDDEN')
  if (!reason.trim() || reason.length > 2000)
    throw new DomainError('REASON_REQUIRED')
  return repo.transaction(async (tx) => {
    const order = await tx.lock()
    await tx.expire(time(clock))
    if (order.status === 'expired') return { status: 'expired' as const }
    if (order.status === target) {
      if (target === 'paid' && !order.proofVerified)
        throw new DomainError('VERIFIED_PROOF_REQUIRED')
      return { status: target }
    }
    if (order.status !== 'reviewing' || !order.proofVerified)
      throw new DomainError('VERIFIED_PROOF_REQUIRED')
    await tx.transition(target, reason.trim())
    return { status: target }
  })
}
