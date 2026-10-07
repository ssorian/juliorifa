export type PurchaseStatus =
  'awaiting_proof' | 'reviewing' | 'paid' | 'rejected' | 'expired' | 'cancelled'
export class DomainError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}
export function expires(status: PurchaseStatus, deadline: number, now: number) {
  return status === 'awaiting_proof' && now >= deadline
}
export function validateTickets(tickets: number[], count: number, start = 1) {
  if (
    !tickets.length ||
    tickets.length > 1000 ||
    new Set(tickets).size !== tickets.length ||
    tickets.some((n) => !Number.isSafeInteger(n) || n < start || n >= start + count)
  )
    throw new DomainError('INVALID_TICKETS')
  return [...tickets].sort((a, b) => a - b)
}
export function quote(price: number, quantity: number, feeBps: number) {
  if (
    ![price, quantity, feeBps].every(Number.isSafeInteger) ||
    price < 1 ||
    quantity < 1 ||
    quantity > 1000 ||
    feeBps < 0 ||
    feeBps > 10000
  )
    throw new DomainError('INVALID_PRICE')
  const subtotalCents = price * quantity
  const feeCents = Math.ceil((subtotalCents * feeBps) / 10000)
  // Manual transfer: fee is an admin expense, never a buyer surcharge.
  const totalCents = subtotalCents
  if (!Number.isSafeInteger(totalCents) || totalCents > 2147483647)
    throw new DomainError('PRICE_OVERFLOW')
  return { subtotalCents, feeCents, totalCents }
}
export function assertSamePayload(stored: string, requested: string) {
  if (stored !== requested) throw new DomainError('IDEMPOTENCY_CONFLICT')
}
export function assertSalesOpen(status: string, deadline: number, now: number) {
  if (
    !Number.isFinite(deadline) ||
    !Number.isFinite(now) ||
    status !== 'active' ||
    now >= deadline
  )
    throw new DomainError('SALES_CLOSED')
}
export function canCancel(
  actor: string,
  owner: string,
  status: PurchaseStatus,
) {
  return actor === owner && status === 'awaiting_proof'
}
