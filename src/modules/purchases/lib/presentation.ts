import type { PurchaseStatus } from '../domain'

export const ownKey = (userId: string, kind: string, id = '') =>
  ['own-purchases', userId, kind, id] as const
export function statusLabel(status: PurchaseStatus) {
  return {
    awaiting_proof: 'Pendiente de comprobante',
    reviewing: 'En revisión — boletos retenidos',
    paid: 'Pago aprobado',
    rejected: 'Rechazado — boletos liberados',
    expired: 'Vencido — boletos liberados',
    cancelled: 'Cancelado — boletos liberados',
  }[status]
}
export function purchaseFlags(
  status: PurchaseStatus,
  expires: string,
  now: number | null,
) {
  const active =
    status === 'awaiting_proof' && now !== null && now < Date.parse(expires)
  return {
    upload: active,
    cancel: active,
    paid: status === 'paid',
    retained: status === 'reviewing',
  }
}
export function safePurchaseId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}
