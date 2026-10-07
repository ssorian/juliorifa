import { DomainError } from '../purchases/domain'

export const MAX_ATTEMPTS = 8
export const LEASE_MS = 600000
export function retryDelay(attempt: number) {
  return Math.min(3600000, 30000 * 2 ** Math.max(0, attempt - 1))
}
export const eventKey = (id: string) => `notification/${id}`
export function deliveryTemplate(
  event: string,
  data: {
    title: string
    ticket?: number
    beneficiary: string
    reason: string
    origin: string
  },
) {
  let origin: URL
  try {
    origin = new URL(data.origin)
  } catch {
    throw new DomainError('NOTIFICATION_ORIGIN_MISSING')
  }
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password
  )
    throw new DomainError('NOTIFICATION_ORIGIN_MISSING')
  const link = new URL('/mis-compras', origin.origin).href
  if (event === 'purchase.approved')
    return {
      subject: `Pago aprobado: ${data.title}`,
      text: `Tu pago de ${data.title} fue aprobado. Tus boletos están pagados.\n${link}`,
    }
  if (event === 'purchase.rejected')
    return {
      subject: `Comprobante rechazado: ${data.title}`,
      text: `Se rechazó el comprobante de ${data.title}. Motivo: ${data.reason}\nLos boletos se liberaron.\n${link}`,
    }
  if (event === 'raffle.winner')
    return {
      subject: `Resultado del sorteo: ${data.title}`,
      text: `Ganaste ${data.title} con el boleto ${data.ticket}.\nCoordina la entrega con ${data.beneficiary}; consulta los detalles de tu compra. Esto no es una solicitud de un nuevo pago.\n${link}`,
    }
  throw new DomainError('UNKNOWN_EVENT')
}
